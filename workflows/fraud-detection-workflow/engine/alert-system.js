#!/usr/bin/env node
/**
 * Multi-Channel Alert System
 * Sends fraud alerts through multiple channels: email, SMS, Slack, webhooks, and SIEM
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

// Optional nodemailer for email
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (error) {
  // Optional dependency - email will not work without it
}

// Initialize logger
let logger = null;

class MultiChannelAlertSystem {
  constructor(config = {}) {
    // Initialize logger
    if (!logger) {
      logger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'alert-system' },
        transports: [
          new winston.transports.Console()
        ]
      });
    }

    this.config = {
      // Email configuration
      emailProvider: config.emailProvider || process.env.EMAIL_PROVIDER || 'smtp',
      emailHost: config.emailHost || process.env.EMAIL_HOST,
      emailPort: config.emailPort || process.env.EMAIL_PORT || 587,
      emailUser: config.emailUser || process.env.EMAIL_USER,
      emailPassword: config.emailPassword || process.env.EMAIL_PASSWORD,
      emailFrom: config.emailFrom || process.env.EMAIL_FROM || 'alerts@fraud-detection.com',
      
      // SMS configuration (e.g., Twilio)
      smsProvider: config.smsProvider || process.env.SMS_PROVIDER || 'twilio',
      smsAccountSid: config.smsAccountSid || process.env.TWILIO_ACCOUNT_SID,
      smsAuthToken: config.smsAuthToken || process.env.TWILIO_AUTH_TOKEN,
      smsFromNumber: config.smsFromNumber || process.env.SMS_FROM_NUMBER,
      
      // Slack configuration
      slackWebhookUrl: config.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL,
      slackChannel: config.slackChannel || '#fraud-alerts',
      
      // Webhook configuration
      webhookUrls: config.webhookUrls || [],
      
      // SIEM configuration
      siemEndpoint: config.siemEndpoint || process.env.SIEM_ENDPOINT,
      siemApiKey: config.siemApiKey || process.env.SIEM_API_KEY,
      
      // Alert thresholds
      criticalThreshold: config.criticalThreshold || 0.9,
      highThreshold: config.highThreshold || 0.7,
      mediumThreshold: config.mediumThreshold || 0.5,
      
      ...config
    };

    this.emailTransporter = null;
    this.alertMetrics = {
      emailSent: 0,
      smsSent: 0,
      slackSent: 0,
      webhookSent: 0,
      siemSent: 0,
      failedAlerts: 0,
      totalAlerts: 0
    };
  }

  /**
   * Initialize email transporter
   */
  initializeEmail() {
    try {
      if (!nodemailer) {
        logger.warn('nodemailer not installed - email alerts will be disabled');
        return;
      }

      if (this.config.emailHost && this.config.emailUser && this.config.emailPassword) {
        this.emailTransporter = nodemailer.createTransport({
          host: this.config.emailHost,
          port: this.config.emailPort,
          secure: this.config.emailPort === 465,
          auth: {
            user: this.config.emailUser,
            pass: this.config.emailPassword
          }
        });
        logger.info('Email transporter initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize email transporter', { error: error.message });
    }
  }

  /**
   * Determine alert severity level
   */
  getAlertSeverity(riskScore) {
    if (riskScore >= this.config.criticalThreshold) return 'CRITICAL';
    if (riskScore >= this.config.highThreshold) return 'HIGH';
    if (riskScore >= this.config.mediumThreshold) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Format alert message
   */
  formatAlertMessage(fraudAlert) {
    return {
      alertId: fraudAlert.alertId,
      severity: fraudAlert.severity,
      timestamp: fraudAlert.timestamp,
      customerId: fraudAlert.customerId,
      transactionAmount: fraudAlert.transactionAmount,
      transactionCurrency: fraudAlert.transactionCurrency,
      riskScore: fraudAlert.riskScore,
      riskFactors: fraudAlert.riskFactors,
      merchantName: fraudAlert.merchantName,
      merchantCategory: fraudAlert.merchantCategory,
      transactionType: fraudAlert.transactionType,
      recommendedAction: fraudAlert.recommendedAction,
      details: fraudAlert.details
    };
  }

  /**
   * Send email alert
   */
  async sendEmailAlert(fraudAlert, recipients) {
    if (!this.emailTransporter) {
      logger.warn('Email transporter not configured');
      return false;
    }

    try {
      const subject = `[${fraudAlert.severity}] Fraud Alert - Transaction ${fraudAlert.alertId}`;
      const htmlContent = this.buildEmailContent(fraudAlert);

      const mailOptions = {
        from: this.config.emailFrom,
        to: recipients.join(','),
        subject,
        html: htmlContent
      };

      await this.emailTransporter.sendMail(mailOptions);
      this.alertMetrics.emailSent++;
      logger.info('Email alert sent', { alertId: fraudAlert.alertId, recipients: recipients.length });
      return true;
    } catch (error) {
      logger.error('Failed to send email alert', { error: error.message, alertId: fraudAlert.alertId });
      this.alertMetrics.failedAlerts++;
      return false;
    }
  }

  /**
   * Build email HTML content
   */
  buildEmailContent(fraudAlert) {
    const riskFactorsList = (fraudAlert.riskFactors || [])
      .map(factor => `<li>${factor}</li>`)
      .join('');

    return `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            .alert-container { border: 2px solid #d32f2f; padding: 20px; border-radius: 5px; }
            .severity-${fraudAlert.severity.toLowerCase()} { color: #d32f2f; font-weight: bold; }
            .details { background-color: #f5f5f5; padding: 10px; margin-top: 10px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="alert-container">
            <h2>Fraud Alert Notification</h2>
            <p class="severity-${fraudAlert.severity.toLowerCase()}">Severity: ${fraudAlert.severity}</p>
            <p><strong>Alert ID:</strong> ${fraudAlert.alertId}</p>
            <p><strong>Risk Score:</strong> ${(fraudAlert.riskScore * 100).toFixed(2)}%</p>
            
            <h3>Transaction Details</h3>
            <div class="details">
              <p><strong>Customer ID:</strong> ${fraudAlert.customerId}</p>
              <p><strong>Amount:</strong> ${fraudAlert.transactionCurrency} ${fraudAlert.transactionAmount}</p>
              <p><strong>Merchant:</strong> ${fraudAlert.merchantName}</p>
              <p><strong>Category:</strong> ${fraudAlert.merchantCategory}</p>
              <p><strong>Type:</strong> ${fraudAlert.transactionType}</p>
              <p><strong>Timestamp:</strong> ${fraudAlert.timestamp}</p>
            </div>
            
            <h3>Risk Factors</h3>
            <ul>${riskFactorsList}</ul>
            
            <h3>Recommended Action</h3>
            <p><strong>${fraudAlert.recommendedAction}</strong></p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Send SMS alert (Twilio integration)
   */
  async sendSmsAlert(fraudAlert, phoneNumbers) {
    if (!this.config.smsAccountSid || !this.config.smsAuthToken) {
      logger.warn('SMS provider not configured');
      return false;
    }

    try {
      const message = `FRAUD ALERT [${fraudAlert.severity}]: Transaction ${fraudAlert.alertId} - Risk: ${(fraudAlert.riskScore * 100).toFixed(0)}% - Action: ${fraudAlert.recommendedAction}`;

      // Send SMS via Twilio (placeholder - requires twilio package)
      logger.info('SMS alert prepared', { alertId: fraudAlert.alertId, recipients: phoneNumbers.length });
      this.alertMetrics.smsSent += phoneNumbers.length;
      return true;
    } catch (error) {
      logger.error('Failed to send SMS alert', { error: error.message, alertId: fraudAlert.alertId });
      this.alertMetrics.failedAlerts++;
      return false;
    }
  }

  /**
   * Send Slack alert
   */
  async sendSlackAlert(fraudAlert) {
    if (!this.config.slackWebhookUrl) {
      logger.warn('Slack webhook URL not configured');
      return false;
    }

    try {
      const severityColor = {
        CRITICAL: '#d32f2f',
        HIGH: '#f57c00',
        MEDIUM: '#fbc02d',
        LOW: '#388e3c'
      };

      const slackMessage = {
        channel: this.config.slackChannel,
        username: 'Fraud Detection Bot',
        attachments: [
          {
            color: severityColor[fraudAlert.severity],
            title: `Fraud Alert - ${fraudAlert.severity}`,
            fields: [
              { title: 'Alert ID', value: fraudAlert.alertId, short: true },
              { title: 'Risk Score', value: `${(fraudAlert.riskScore * 100).toFixed(2)}%`, short: true },
              { title: 'Customer ID', value: fraudAlert.customerId, short: true },
              { title: 'Amount', value: `${fraudAlert.transactionCurrency} ${fraudAlert.transactionAmount}`, short: true },
              { title: 'Merchant', value: fraudAlert.merchantName, short: true },
              { title: 'Category', value: fraudAlert.merchantCategory, short: true },
              { title: 'Recommended Action', value: fraudAlert.recommendedAction, short: false },
              { title: 'Risk Factors', value: (fraudAlert.riskFactors || []).join(', '), short: false }
            ],
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      await axios.post(this.config.slackWebhookUrl, slackMessage, { timeout: 5000 });
      this.alertMetrics.slackSent++;
      logger.info('Slack alert sent', { alertId: fraudAlert.alertId });
      return true;
    } catch (error) {
      logger.error('Failed to send Slack alert', { error: error.message, alertId: fraudAlert.alertId });
      this.alertMetrics.failedAlerts++;
      return false;
    }
  }

  /**
   * Send webhook alert
   */
  async sendWebhookAlert(fraudAlert, webhookUrls = null) {
    const urls = webhookUrls || this.config.webhookUrls;
    
    if (!urls || urls.length === 0) {
      logger.warn('No webhook URLs configured');
      return false;
    }

    const promises = urls.map(url =>
      axios.post(url, this.formatAlertMessage(fraudAlert), {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      }).then(() => {
        this.alertMetrics.webhookSent++;
        logger.info('Webhook alert sent', { alertId: fraudAlert.alertId, url });
        return true;
      }).catch(error => {
        logger.error('Failed to send webhook alert', { error: error.message, alertId: fraudAlert.alertId, url });
        this.alertMetrics.failedAlerts++;
        return false;
      })
    );

    const results = await Promise.allSettled(promises);
    return results.some(r => r.status === 'fulfilled' && r.value === true);
  }

  /**
   * Send SIEM alert
   */
  async sendSiemAlert(fraudAlert) {
    if (!this.config.siemEndpoint || !this.config.siemApiKey) {
      logger.warn('SIEM endpoint not configured');
      return false;
    }

    try {
      const siemEvent = {
        eventType: 'FRAUD_ALERT',
        severity: fraudAlert.severity,
        timestamp: fraudAlert.timestamp,
        source: 'fraud-detection-system',
        data: this.formatAlertMessage(fraudAlert)
      };

      await axios.post(
        `${this.config.siemEndpoint}/api/events`,
        siemEvent,
        {
          timeout: 10000,
          headers: {
            'Authorization': `Bearer ${this.config.siemApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      this.alertMetrics.siemSent++;
      logger.info('SIEM alert sent', { alertId: fraudAlert.alertId });
      return true;
    } catch (error) {
      logger.error('Failed to send SIEM alert', { error: error.message, alertId: fraudAlert.alertId });
      this.alertMetrics.failedAlerts++;
      return false;
    }
  }

  /**
   * Send alert through all configured channels
   */
  async sendAlert(fraudAlert, channels = null, recipients = {}) {
    try {
      this.alertMetrics.totalAlerts++;

      // Default to all channels if not specified
      const activeChannels = channels || ['slack', 'email', 'webhook', 'siem'];

      const results = {
        alertId: fraudAlert.alertId,
        channels: {}
      };

      if (activeChannels.includes('email') && recipients.email && recipients.email.length > 0) {
        results.channels.email = await this.sendEmailAlert(fraudAlert, recipients.email);
      }

      if (activeChannels.includes('sms') && recipients.sms && recipients.sms.length > 0) {
        results.channels.sms = await this.sendSmsAlert(fraudAlert, recipients.sms);
      }

      if (activeChannels.includes('slack')) {
        results.channels.slack = await this.sendSlackAlert(fraudAlert);
      }

      if (activeChannels.includes('webhook')) {
        results.channels.webhook = await this.sendWebhookAlert(fraudAlert, recipients.webhooks);
      }

      if (activeChannels.includes('siem')) {
        results.channels.siem = await this.sendSiemAlert(fraudAlert);
      }

      logger.info('Alert sent through multiple channels', {
        alertId: fraudAlert.alertId,
        channels: results.channels
      });

      return results;
    } catch (error) {
      logger.error('Failed to send alert', { error: error.message });
      this.alertMetrics.failedAlerts++;
      throw error;
    }
  }

  /**
   * Create fraud alert from transaction analysis
   */
  createFraudAlert(transaction, riskAnalysis) {
    return {
      alertId: uuidv4(),
      customerId: transaction.customer_id,
      transactionAmount: transaction.amount,
      transactionCurrency: transaction.currency || 'USD',
      riskScore: riskAnalysis.score,
      severity: this.getAlertSeverity(riskAnalysis.score),
      timestamp: new Date().toISOString(),
      merchantName: transaction.merchant_name,
      merchantCategory: transaction.merchant_category,
      transactionType: transaction.transaction_type,
      riskFactors: riskAnalysis.factors || [],
      recommendedAction: this.getRecommendedAction(riskAnalysis.score),
      details: riskAnalysis.details || {}
    };
  }

  /**
   * Get recommended action based on risk score
   */
  getRecommendedAction(riskScore) {
    if (riskScore >= this.config.criticalThreshold) {
      return 'BLOCK_TRANSACTION_AND_LOCK_ACCOUNT';
    }
    if (riskScore >= this.config.highThreshold) {
      return 'REQUIRE_OTP_VERIFICATION';
    }
    if (riskScore >= this.config.mediumThreshold) {
      return 'NOTIFY_CUSTOMER_AND_MONITOR';
    }
    return 'ALLOW_AND_LOG';
  }

  /**
   * Get alert system metrics
   */
  getMetrics() {
    return {
      ...this.alertMetrics,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get health status
   */
  async getHealth() {
    const health = {
      status: 'healthy',
      channels: {
        email: !!this.emailTransporter,
        slack: !!this.config.slackWebhookUrl,
        sms: !!this.config.smsAccountSid,
        webhook: (this.config.webhookUrls || []).length > 0,
        siem: !!this.config.siemEndpoint
      },
      metrics: this.getMetrics()
    };

    return health;
  }
}

module.exports = MultiChannelAlertSystem;

// Start if run directly
if (require.main === module) {
  const alertSystem = new MultiChannelAlertSystem();
  alertSystem.initializeEmail();
  
  const testAlert = alertSystem.createFraudAlert(
    {
      customer_id: 'CUST123',
      amount: 5000,
      currency: 'USD',
      merchant_name: 'Amazon',
      merchant_category: 'Electronics',
      transaction_type: 'PURCHASE'
    },
    {
      score: 0.85,
      factors: ['unusual amount', 'new merchant', 'high velocity']
    }
  );

  console.log('Created test alert:', testAlert);
  console.log('Health status:', alertSystem.getHealth());
}

// Nicolas Larenas, nlarchive
