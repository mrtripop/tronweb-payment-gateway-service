/**
 * Logger utility for tracking payment journey
 */

const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create payment journey log file stream
const paymentJourneyLog = fs.createWriteStream(
  path.join(logsDir, 'payment-journey.log'),
  { flags: 'a' }
);

// Create error log file stream
const errorLog = fs.createWriteStream(
  path.join(logsDir, 'error.log'),
  { flags: 'a' }
);

/**
 * Log a payment journey event
 * @param {string} paymentId - The payment ID
 * @param {string} stage - The stage in the payment journey
 * @param {Object} data - Additional data to log
 */
function logPaymentJourney(paymentId, stage, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    paymentId,
    stage,
    data
  };
  
  console.log(`[PAYMENT JOURNEY] ${timestamp} | ${paymentId} | ${stage}`);
  paymentJourneyLog.write(JSON.stringify(logEntry) + '\n');
}

/**
 * Log an error in the payment journey
 * @param {string} paymentId - The payment ID (or 'system' for system-wide errors)
 * @param {string} stage - The stage where the error occurred
 * @param {Error|string} error - The error object or message
 * @param {Object} additionalData - Any additional context data
 */
function logError(paymentId, stage, error, additionalData = {}) {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : error;
  const stack = error instanceof Error ? error.stack : null;
  
  const logEntry = {
    timestamp,
    paymentId,
    stage,
    error: errorMessage,
    stack,
    additionalData
  };
  
  console.error(`[ERROR] ${timestamp} | ${paymentId} | ${stage} | ${errorMessage}`);
  errorLog.write(JSON.stringify(logEntry) + '\n');
}

/**
 * Define standard payment journey stages
 */
const PAYMENT_STAGES = {
  // Creation stage
  PAYMENT_REQUESTED: 'PAYMENT_REQUESTED',
  ADDRESS_GENERATED: 'ADDRESS_GENERATED',
  PAYMENT_CREATED: 'PAYMENT_CREATED',
  
  // Monitoring stage
  PAYMENT_DETECTED: 'PAYMENT_DETECTED',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  
  // Processing stage
  PROCESSING_STARTED: 'PROCESSING_STARTED',
  TRANSFERRING_TO_MAIN: 'TRANSFERRING_TO_MAIN',
  TRANSFER_COMPLETED: 'TRANSFER_COMPLETED',
  
  // Status changes
  STATUS_CHANGED: 'STATUS_CHANGED',
  
  // Webhook
  WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',
  WEBHOOK_PROCESSED: 'WEBHOOK_PROCESSED',
  MERCHANT_CALLBACK_SENT: 'MERCHANT_CALLBACK_SENT',
  
  // Errors
  ERROR: 'ERROR'
};

module.exports = {
  logPaymentJourney,
  logError,
  PAYMENT_STAGES
}; 