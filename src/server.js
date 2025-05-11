const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const logger = require('./utils/logger');
const paymentProcessor = require('./services/payment-processor');
const { startActivationService } = require('./services/activation-service');
require('dotenv').config();

// Initialize Express app
const app = express();
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    logger.info('Connected to MongoDB');
  })
  .catch((error) => {
    logger.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  });

// API routes
app.use('/api/payments', require('./routes/payment.routes'));

// Start payment processing schedule (every 2 minutes)
const paymentSchedule = cron.schedule('*/2 * * * *', () => {
  logger.info('Running scheduled payment processing...');
  paymentProcessor.processPayments();
});

// Start account activation service
const activationService = startActivationService();

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  logger.info('Shutting down server...');
  
  // Stop scheduled tasks
  paymentSchedule.stop();
  
  // Stop activation service
  activationService.stop();
  
  // Close server connections
  server.close(() => {
    logger.info('Server closed');
    
    // Close database connection
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
  
  // Force exit if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
} 