// orchestrator/plugins/nats-wrapper.js
// NATS Pub/Sub plugin wrapper for orchestrator

const nats = require('nats');

class NatsWrapper {
  constructor(config = {}) {
    this.config = {
      url: config.url || process.env.NATS_URL || 'nats://localhost:4222',
      ...config
    };
    this.nc = null;
    this.js = null; // JetStream client
    this.jsm = null; // JetStream manager
    this.subscriptions = new Map(); // Track subscriptions by subject
  }

  async connect() {
    try {
      this.nc = await nats.connect({
        servers: [this.config.url],
        name: 'orchestrator-nats-client'
      });
      // Initialize JetStream client and manager
      this.js = this.nc.jetstream();
      try {
        this.jsm = await this.nc.jetstreamManager();
      } catch (err) {
        console.log('[NATS] JetStream Manager not available:', err.message);
      }
      console.log('[NATS] Connected to', this.config.url);
      return true;
    } catch (err) {
      console.error('[NATS] Connection failed:', err.message);
      throw err;
    }
  }

  async disconnect() {
    // Unsubscribe from all active subscriptions
    if (this.subscriptions.size > 0) {
      console.log(`[NATS] Unsubscribing from ${this.subscriptions.size} subscriptions`);
      for (const [subject, sub] of this.subscriptions) {
        try {
          await sub.unsubscribe();
        } catch (err) {
          console.error(`[NATS] Error unsubscribing from ${subject}:`, err.message);
        }
      }
      this.subscriptions.clear();
    }
    
    // Close connection
    if (this.nc) {
      await this.nc.close();
      this.nc = null;
      this.js = null;
      this.jsm = null;
      console.log('[NATS] Disconnected');
    }
  }

  async publish(input) {
    const { subject, message } = input;
    if (!this.nc) throw new Error('NATS not connected');
    if (!subject) throw new Error('Subject is required for publish');
    if (message === undefined) throw new Error('Message is required for publish');
    
    try {
      // Try to use JetStream for publish to get message ID
      if (this.js) {
        const msg = typeof message === 'object' ? nats.JSONCodec().encode(message) :
                    typeof message === 'string' ? new TextEncoder().encode(message) : message;

        try {
          const pubAck = await this.js.publish(subject, msg);
          console.log(`[NATS] Published to ${subject}`);
          return { success: true, subject, messageId: pubAck.seq };
        } catch (jsErr) {
          // If JetStream publish fails, try to create the stream and retry
          if (jsErr.message.includes('stream not found') || jsErr.message.includes('503') || jsErr.code === '503') {
            console.log(`[NATS] Stream not found for ${subject}, attempting to create stream`);
            try {
              // Extract stream name from subject (use first part before first dot, or 'events' as fallback)
              const streamName = subject.split('.')[0] || 'events';
              await this.streamAdd(streamName, [subject]);
              // Retry publish after creating stream
              const pubAck = await this.js.publish(subject, msg);
              console.log(`[NATS] Published to ${subject} (after stream creation)`);
              return { success: true, subject, messageId: pubAck.seq };
            } catch (streamErr) {
              console.error(`[NATS] Failed to create stream for ${subject}:`, streamErr.message);
              throw streamErr;
            }
          } else {
            throw jsErr;
          }
        }
      } else {
        // Fallback to core NATS if JetStream unavailable
        const msg = typeof message === 'string' ? message : JSON.stringify(message);
        await this.nc.publish(subject, msg);
        console.log(`[NATS] Published to ${subject}`);
        return { success: true, subject };
      }
    } catch (err) {
      console.error(`[NATS] Publish failed on ${subject}:`, err.message);
      throw err;
    }
  }

  async subscribe(subject, callback) {
    if (!this.nc) throw new Error('NATS not connected');
    
    // Return early if already subscribed
    if (this.subscriptions.has(subject)) {
      console.log(`[NATS] Already subscribed to ${subject}`);
      return this.subscriptions.get(subject);
    }
    
    try {
      // Try JetStream subscription first if available
      if (this.js && this.jsm) {
        try {
          // Accept streamName as third argument
          let streamName = 'events';
          if (typeof callback === 'object' && callback !== null && callback.streamName) {
            streamName = callback.streamName;
            callback = callback.callback;
          }
          const opts = nats.consumerOpts();
          opts.deliverNew();
          opts.manualAck();
          opts.durable(`durable_${subject.replace(/\W/g, '_')}`);
          opts.ackExplicit();
          opts.bindStream(streamName);

          const sub = await this.js.subscribe(subject, opts);
          this.subscriptions.set(subject, sub);

          (async () => {
            try {
              for await (const msg of sub) {
                try {
                  const data = msg.data ? JSON.parse(new TextDecoder().decode(msg.data)) : null;
                  await callback(null, data);
                  msg.ack();
                } catch (err) {
                  msg.nak();
                  await callback(err, null);
                }
              }
            } catch (err) {
              if (!err.message.includes('subscription closed')) {
                console.error(`[NATS] Subscription error on ${subject}:`, err.message);
              }
            }
          })();

          console.log(`[NATS] Subscribed to ${subject} (stream: ${streamName})`);
          return sub;
        } catch (jsErr) {
          // JetStream subscription failed, fall back to core NATS
          console.log(`[NATS] JetStream subscription failed for ${subject}, falling back to core NATS:`, jsErr.message);
        }
      }
      
      // Core NATS subscription as fallback (use async iterator)
      const sub = this.nc.subscribe(subject);

      (async () => {
        try {
          for await (const msg of sub) {
            try {
              const data = msg.data ? JSON.parse(new TextDecoder().decode(msg.data)) : null;
              console.log(`[NATS] Core subscription received message for ${subject}:`, data);
              await callback(null, data);
            } catch (parseErr) {
              console.log(`[NATS] Core subscription parse/error for ${subject}:`, parseErr.message);
              await callback(parseErr, null);
            }
          }
        } catch (err) {
          if (!err.message.includes('subscription closed')) {
            console.error(`[NATS] Core subscription iterator error for ${subject}:`, err.message);
          }
        }
      })();

      this.subscriptions.set(subject, sub);
      console.log(`[NATS] Subscribed to ${subject}`);
      return sub;
    } catch (err) {
      console.error(`[NATS] Subscribe failed on ${subject}:`, err.message);
      throw err;
    }
  }

  async streamAdd(streamName, subjects) {
    if (!this.jsm) {
      console.log(`[NATS] Stream support may not be available in this NATS version`);
      return { success: true, streamName, warning: 'Stream functionality may be limited' };
    }
    
    try {
      const subjectsArray = Array.isArray(subjects) ? subjects : [subjects];
      await this.jsm.streams.add({
        name: streamName,
        subjects: subjectsArray
      });
      console.log(`[NATS] Stream '${streamName}' created with subjects: ${subjectsArray.join(', ')}`);
      return { success: true, streamName };
    } catch (err) {
      // Stream already exists is not an error
      if (err.message.includes('stream name already in use')) {
        console.log(`[NATS] Stream '${streamName}' already exists`);
        return { success: true, streamName, existed: true };
      }
      console.error(`[NATS] Stream add failed for ${streamName}:`, err.message);
      throw err;
    }
  }

  async streamInfo(streamName) {
    if (!this.jsm) {
      console.log(`[NATS] Stream info not available - JetStream Manager not initialized`);
      return { status: 'unavailable' };
    }
    
    try {
      const info = await this.jsm.streams.info(streamName);
      return info;
    } catch (err) {
      console.error(`[NATS] Stream info failed for ${streamName}:`, err.message);
      throw err;
    }
  }

  async getHealth() {
    try {
      const response = await fetch(`${this.config.url.replace('nats://', 'http://').replace(':4222', ':8222')}/varz`);
      const data = await response.json();
      return {
        status: 'healthy',
        version: data.version,
        messages: data.in_msgs,
        bytes: data.in_bytes
      };
    } catch (err) {
      return { status: 'unhealthy', error: err.message };
    }
  }
}

module.exports = NatsWrapper;

// Nicolas Larenas, nlarchive
