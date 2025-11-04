/**
 * Streamer Manager - Loads and manages streamer plugins
 * 
 * Usage:
 *   const manager = require('./manager');
 *   await manager.load('mock', { intervalMs: 1000, batchSize: 50 });
 *   manager.on('data', (tx) => pipeline.process(tx));
 *   await manager.start();
 */

const path = require('path');
const EventEmitter = require('events');

class StreamerManager extends EventEmitter {
  constructor() {
    super();
    this.plugin = null;
    this.config = {};
    this.name = null;
  }

  /**
   * Load a streamer plugin by name
   * @param {string} name - streamer name (e.g., 'mock', 'nats', 'http')
   * @param {object} config - streamer configuration
   */
  async load(name, config = {}) {
    if (!name) throw new Error('Streamer name is required');
    
    try {
      // Construct path to streamer module
      const modulePath = path.join(__dirname, `${name}-streamer.js`);
      this.plugin = require(modulePath);
      this.name = name;
      this.config = config;
      
      // Initialize the plugin if it has an init method
      if (this.plugin.init && typeof this.plugin.init === 'function') {
        await this.plugin.init(config);
      }
      
      // Wire plugin events to this manager's listeners
      this._wirePluginEvents();
      
      console.log(`[StreamerManager] Loaded streamer: ${name}`);
    } catch (err) {
      console.error(`[StreamerManager] Failed to load streamer '${name}':`, err.message);
      throw new Error(`Cannot load streamer '${name}': ${err.message}`);
    }
  }

  /**
   * Wire plugin events to manager event listeners
   * @private
   */
  _wirePluginEvents() {
    if (!this.plugin) return;

    if (typeof this.plugin.on === 'function') {
      // Forward 'data' events
      this.plugin.on('data', (data) => {
        try {
          this.emit('data', data);
        } catch (err) {
          console.error('[StreamerManager] Error forwarding data event:', err);
        }
      });

      // Forward 'error' events
      this.plugin.on('error', (err) => {
        try {
          this.emit('error', err);
        } catch (e) {
          console.error('[StreamerManager] Error forwarding error event:', e);
        }
      });

      // Forward 'health' events
      this.plugin.on('health', (status) => {
        try {
          this.emit('health', status);
        } catch (err) {
          console.error('[StreamerManager] Error forwarding health event:', err);
        }
      });
    }
  }

  /**
   * Start the loaded streamer
   */
  async start() {
    if (!this.plugin) throw new Error('No streamer loaded');
    if (!this.plugin.start || typeof this.plugin.start !== 'function') {
      throw new Error('Streamer does not implement start()');
    }
    
    console.log(`[StreamerManager] Starting streamer: ${this.name}`);
    await this.plugin.start();
  }

  /**
   * Stop the loaded streamer
   */
  async stop() {
    if (!this.plugin) {
      console.warn('[StreamerManager] No streamer loaded to stop');
      return;
    }
    if (!this.plugin.stop || typeof this.plugin.stop !== 'function') {
      console.warn('[StreamerManager] Streamer does not implement stop()');
      return;
    }

    console.log(`[StreamerManager] Stopping streamer: ${this.name}`);
    await this.plugin.stop();
  }

  /**
   * Get current streamer name
   */
  getCurrentStreamer() {
    return this.name;
  }

  /**
   * Check if a streamer is loaded
   */
  isLoaded() {
    return this.plugin !== null;
  }
}

module.exports = new StreamerManager();

// Nicolas Larenas, nlarchive
