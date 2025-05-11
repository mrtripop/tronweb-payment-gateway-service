const TronWeb = require('tronweb');
const Payment = require('../models/payment.model');
const logger = require('../utils/logger');
const { delegateEnergy, delegateBandwidth } = require('../utils/resource-delegation');
require('dotenv').config();

// Initialize TronWeb with the main wallet's private key
const tronWeb = new TronWeb({
  fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY
});

// Constants
const DEFAULT_ENERGY_DELEGATION = 100000;
const DEFAULT_BANDWIDTH_DELEGATION = 1000;
const MAX_ACTIVATION_ATTEMPTS = 3;
const ACTIVATION_INTERVAL = 60000; // 1 minute

/**
 * Activate a single wallet address
 * @param {string} address - The wallet address to activate
 * @param {number} activationAmount - Amount of TRX to send (in SUN)
 * @returns {Promise<boolean>} - Whether activation was successful
 */
async function activateWallet(address, activationAmount = 5000000) {
  try {
    // Send TRX to activate the account
    const transaction = await tronWeb.trx.sendTransaction(
      address,
      activationAmount.toString()
    );
    
    logger.info(`Sent ${activationAmount/1000000} TRX to ${address}. Transaction ID: ${transaction.txid}`);
    
    // Wait for transaction to be processed
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verify account is activated
    try {
      const account = await tronWeb.trx.getAccount(address);
      const isActivated = !!account.address;
      
      if (isActivated) {
        logger.info(`Account ${address} successfully activated!`);
        
        // Delegate resources
        await delegateEnergy(address, DEFAULT_ENERGY_DELEGATION);
        await delegateBandwidth(address, DEFAULT_BANDWIDTH_DELEGATION);
        
        return true;
      } else {
        logger.warn(`Account ${address} still not activated after verification`);
        return false;
      }
    } catch (verifyError) {
      logger.error(`Failed to verify account activation: ${verifyError.message}`);
      return false;
    }
  } catch (error) {
    logger.error(`Failed to activate account ${address}: ${error.message}`);
    return false;
  }
}

/**
 * Process all pending payments that need activation
 */
async function processPendingActivations() {
  try {
    logger.info('Running activation service for pending payments...');
    
    // Find payments that need activation (pending status and created in the last 24 hours)
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    const pendingPayments = await Payment.find({
      status: 'pending',
      createdAt: { $gte: twentyFourHoursAgo }
    });
    
    logger.info(`Found ${pendingPayments.length} pending payments to process`);
    
    for (const payment of pendingPayments) {
      try {
        // Check if account already exists
        let isActivated = false;
        
        try {
          const account = await tronWeb.trx.getAccount(payment.address);
          isActivated = !!account.address;
        } catch (error) {
          isActivated = false;
        }
        
        if (isActivated) {
          logger.info(`Account ${payment.address} for payment ${payment.paymentId} is already activated`);
          continue;
        }
        
        // Try to activate account with multiple attempts
        let activationSuccess = false;
        let attempts = 0;
        
        while (!activationSuccess && attempts < MAX_ACTIVATION_ATTEMPTS) {
          attempts++;
          logger.info(`Activation attempt ${attempts}/${MAX_ACTIVATION_ATTEMPTS} for payment ${payment.paymentId}`);
          
          // Increase TRX amount with each attempt
          const activationAmount = 1000000 * (attempts * 5); // 5, 10, 15 TRX
          activationSuccess = await activateWallet(payment.address, activationAmount);
          
          if (activationSuccess) {
            logger.info(`Successfully activated account ${payment.address} on attempt ${attempts}`);
            
            // Update payment to mark activation success
            await Payment.updateOne(
              { paymentId: payment.paymentId },
              { $set: { accountActivated: true } }
            );
            
            break;
          }
          
          if (!activationSuccess && attempts < MAX_ACTIVATION_ATTEMPTS) {
            // Wait longer between attempts
            const waitTime = 5000 * attempts;
            logger.info(`Waiting ${waitTime/1000} seconds before next activation attempt...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
        
        if (!activationSuccess) {
          logger.warn(`Failed to activate account ${payment.address} after ${MAX_ACTIVATION_ATTEMPTS} attempts`);
        }
      } catch (paymentError) {
        logger.error(`Error processing activation for payment ${payment.paymentId}: ${paymentError.message}`);
      }
    }
    
    logger.info('Activation service run completed');
  } catch (error) {
    logger.error(`Error in activation service: ${error.message}`);
  }
}

/**
 * Start the activation service that runs at regular intervals
 */
function startActivationService() {
  logger.info('Starting TRON wallet activation service...');
  
  // Run immediately
  processPendingActivations();
  
  // Then run at regular intervals
  const intervalId = setInterval(processPendingActivations, ACTIVATION_INTERVAL);
  
  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Shutting down activation service...');
    clearInterval(intervalId);
  });
  
  process.on('SIGINT', () => {
    logger.info('Shutting down activation service...');
    clearInterval(intervalId);
  });
  
  return {
    stop: () => {
      clearInterval(intervalId);
      logger.info('Activation service stopped');
    }
  };
}

module.exports = {
  activateWallet,
  processPendingActivations,
  startActivationService
}; 