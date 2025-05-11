const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const { startPaymentProcessor, processPayments } = require('./src/utils/payment-processor');
const { logPaymentJourney, logError, PAYMENT_STAGES } = require('./src/utils/logger');
const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

// Log application startup
logPaymentJourney('SYSTEM', 'APPLICATION_STARTED', {
  env: process.env.NODE_ENV,
  tronNetwork: process.env.TRON_FULL_HOST,
  usdtContract: process.env.USDT_CONTRACT_ADDRESS,
  timestamp: new Date().toISOString()
});

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Import routes
const paymentRoutes = require('./src/routes/payment.routes');

// Use routes
app.use('/api/payment', paymentRoutes);

// Home route
app.get('/', (req, res) => {
  res.send('TRON USDT Payment Gateway API is running');
});

// Endpoint to manually trigger payment processing
app.post('/api/admin/process-payments', async (req, res) => {
  try {
    // Check for API key in header or query param for security
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    // Log the manual trigger
    logPaymentJourney('ADMIN', 'MANUAL_PROCESS_TRIGGER', {
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    
    // Process payments in the background
    processPayments()
      .then(() => {
        console.log('Manual payment processing completed');
      })
      .catch(error => {
        console.error('Error in manual payment processing:', error);
      });
    
    // Immediately respond that processing has started
    return res.status(200).json({ 
      success: true, 
      message: 'Payment processing triggered successfully'
    });
  } catch (error) {
    console.error('Error in manual process endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error triggering payment processing' 
    });
  }
});

// API request logger middleware
app.use((req, res, next) => {
  logPaymentJourney('API', 'REQUEST', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  next();
});

// Graceful shutdown function
const gracefulShutdown = () => {
  console.log('Received shutdown signal, closing connections...');
  
  // Log the shutdown
  logPaymentJourney('SYSTEM', 'APPLICATION_SHUTDOWN', {
    timestamp: new Date().toISOString()
  });
  
  // Close any connections here if needed
  
  process.exit(0);
};

// Handle termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Global error handler
process.on('uncaughtException', (error) => {
  logError('SYSTEM', 'UNCAUGHT_EXCEPTION', error);
  console.error('Uncaught Exception:', error);
  // Keep the process running despite the error
});

process.on('unhandledRejection', (reason, promise) => {
  logError('SYSTEM', 'UNHANDLED_REJECTION', { reason, promise });
  console.error('Unhandled Promise Rejection:', reason);
  // Keep the process running despite the rejection
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Log server started
  logPaymentJourney('SYSTEM', 'SERVER_STARTED', {
    port: PORT,
    timestamp: new Date().toISOString()
  });
  
  // Start payment processor with auto-restart capability
  const startProcessorWithRestart = () => {
    console.log('Starting payment processor...');
    
    startPaymentProcessor().catch(err => {
      logError('SYSTEM', 'PAYMENT_PROCESSOR_FAILED', err);
      console.error('Payment processor crashed:', err);
      
      // Wait 30 seconds before restarting
      console.log('Restarting payment processor in 30 seconds...');
      setTimeout(startProcessorWithRestart, 30000);
    });
  };
  
  // Start the processor
  startProcessorWithRestart();
});

module.exports = app; 