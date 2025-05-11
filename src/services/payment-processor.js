const TronWeb = require('tronweb');
const logger = require('../utils/logger');
const Payment = require('../models/payment.model');
const { getUsdtBalance } = require('../utils/tron.service');
const { activateAccount, delegateEnergy, accountExists, getAccountResources } = require('../utils/resource-delegation');
require('dotenv').config();

// TronWeb instance
const tronWeb = new TronWeb({
  fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY
});

// USDT contract address
const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// Constants for resource delegation
const DEFAULT_ENERGY_DELEGATION = 100000; // Amount of energy to delegate
const DEFAULT_BANDWIDTH_DELEGATION = 1000; // Amount of bandwidth to delegate
const MINIMUM_TRX_TRANSFER = 100000; // 0.1 TRX in SUN units

/**
 * Process payments by checking USDT balances and transferring to main wallet
 */
async function processPayments() {
  try {
    logger.info('Starting payment processing...');

    // Find pending payments
    const pendingPayments = await Payment.find({ status: 'pending' });
    logger.info(`Found ${pendingPayments.length} pending payments to process`);

    for (const payment of pendingPayments) {
      try {
        // Step 1: Check if account exists, if not activate it
        const accountActive = await accountExists(payment.address);
        if (!accountActive) {
          logger.info(`Activating account ${payment.address} for payment ${payment.paymentId}`);
          const activationResult = await activateAccount(payment.address);
          
          if (!activationResult.success) {
            logger.error(`Failed to activate account for payment ${payment.paymentId}: ${activationResult.error}`);
            continue;
          }
          
          // Wait for account activation to propagate
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Step 2: Check account resources and delegate if needed
        const resourcesCheck = await getAccountResources(payment.address);
        if (resourcesCheck.success) {
          // If energy is low, delegate some energy
          if (resourcesCheck.energy < 100000) {
            logger.info(`Delegating energy to ${payment.address} for payment ${payment.paymentId}`);
            await delegateEnergy(payment.address, DEFAULT_ENERGY_DELEGATION);
          }
        }

        // Step 3: Check USDT balance
        const balance = await getUsdtBalance(payment.address);
        
        logger.info(`Payment ${payment.paymentId}: Address ${payment.address} has balance ${balance} USDT, expected ${payment.amount} USDT`);

        // If balance matches or exceeds expected amount, mark as paid
        if (balance >= payment.amount) {
          logger.info(`Payment ${payment.paymentId} received full amount. Processing transfer to main wallet.`);

          // Step 4: Set up USDT contract instance for transferring tokens
          const usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
          
          // Get the decimal precision of USDT (usually 6)
          const decimals = await usdtContract.decimals().call();
          const decimalFactor = 10 ** decimals;

          // Calculate amount with proper decimal precision
          const amountToTransfer = Math.floor(payment.amount * decimalFactor);

          try {
            // Step 5: Transfer USDT to main wallet
            // First, set the private key to the temporary wallet's private key
            // This requires storing private keys for temp wallets securely, e.g., encrypted in the database
            // For demo purposes, set an environment variable that would contain this private key
            const tempPrivateKey = payment.privateKey || process.env.TEMP_ACCOUNT_PRIVATE_KEY;
            
            if (!tempPrivateKey) {
              logger.error(`No private key available for payment ${payment.paymentId}`);
              continue;
            }
            
            // Create a separate TronWeb instance with the temp wallet's private key
            const tempTronWeb = new TronWeb({
              fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
              privateKey: tempPrivateKey
            });
            
            // Connect to the contract with the temp wallet's credentials
            const tempUsdtContract = await tempTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
            
            // Transfer USDT to main wallet
            const transferResult = await tempUsdtContract.transfer(
              process.env.MAIN_WALLET_ADDRESS,
              amountToTransfer.toString()
            ).send();
            
            // Update payment status
            payment.status = 'completed';
            payment.transferTransactionId = transferResult;
            await payment.save();
            
            logger.info(`Payment ${payment.paymentId} transferred to main wallet. Transaction ID: ${transferResult}`);
          } catch (transferError) {
            logger.error(`Error transferring USDT to main wallet for payment ${payment.paymentId}: ${transferError.message}`);
            
            // Update payment to indicate funds received but transfer failed
            payment.status = 'funds_received';
            await payment.save();
          }
        }
      } catch (paymentError) {
        logger.error(`Error processing payment ${payment.paymentId}: ${paymentError.message}`);
      }
    }

    logger.info('Payment processing complete');
  } catch (error) {
    logger.error(`Error in payment processor: ${error.message}`);
  }
}

/**
 * Create a new payment
 * @param {number} amount - Amount in USDT
 * @param {string} orderId - Unique order ID
 * @returns {Promise<{success: boolean, paymentId?: string, address?: string, error?: string}>}
 */
async function createPayment(amount, orderId) {
  try {
    // Generate a unique payment ID
    const paymentId = `order_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    // Create a new account for this payment
    const account = tronWeb.utils.accounts.generateAccount();
    const address = account.address.base58;
    
    // Create payment record
    const payment = new Payment({
      paymentId,
      orderId,
      address,
      amount,
      status: 'pending',
      // In a production system, encrypt the private key before storage
      privateKey: account.privateKey
    });
    
    await payment.save();
    
    // ROBUST ACCOUNT ACTIVATION - sending higher TRX amount (5 TRX) and implementing retries
    let accountActivated = false;
    let activationAttempts = 0;
    const maxActivationAttempts = 3;
    
    while (!accountActivated && activationAttempts < maxActivationAttempts) {
      activationAttempts++;
      logger.info(`Account activation attempt ${activationAttempts}/${maxActivationAttempts} for payment ${paymentId}`);
      
      try {
        // Send a higher TRX amount to ensure activation (5 TRX)
        const activationAmount = 5000000; // 5 TRX in SUN units
        const trxTx = await tronWeb.trx.sendTransaction(
          address,
          activationAmount.toString()
        );
        
        logger.info(`Sent ${activationAmount/1000000} TRX to ${address}. Transaction ID: ${trxTx.txid}`);
        
        // Wait a bit for transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify account activation
        try {
          const account = await tronWeb.trx.getAccount(address);
          accountActivated = !!account.address;
          
          if (accountActivated) {
            logger.info(`Account ${address} successfully activated!`);
            
            // Now that account is activated, delegate resources
            try {
              const energyResult = await delegateEnergy(address, DEFAULT_ENERGY_DELEGATION);
              logger.info(`Energy delegation for ${address}: ${energyResult.success ? 'successful' : 'failed'}`);
              
              const bandwidthResult = await delegateBandwidth(address, DEFAULT_BANDWIDTH_DELEGATION);
              logger.info(`Bandwidth delegation for ${address}: ${bandwidthResult.success ? 'successful' : 'failed'}`);
            } catch (resourceError) {
              logger.warn(`Resource delegation error for ${address}: ${resourceError.message}`);
            }
          }
        } catch (accountError) {
          logger.warn(`Failed to verify account activation: ${accountError.message}`);
        }
      } catch (activationError) {
        logger.error(`Activation attempt ${activationAttempts} failed: ${activationError.message}`);
      }
      
      if (!accountActivated && activationAttempts < maxActivationAttempts) {
        // Wait between attempts
        const waitTime = 5000 * activationAttempts; // Increase wait time with each attempt
        logger.info(`Waiting ${waitTime/1000} seconds before next activation attempt...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    if (!accountActivated) {
      logger.warn(`Could not confirm account activation for ${address} after ${maxActivationAttempts} attempts`);
    }
    
    return {
      success: true,
      paymentId,
      address,
      activated: accountActivated
    };
  } catch (error) {
    logger.error(`Error creating payment: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Get payment status
 * @param {string} paymentId - Payment ID
 * @returns {Promise<{success: boolean, payment?: object, error?: string}>}
 */
async function getPaymentStatus(paymentId) {
  try {
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      return { success: false, error: 'Payment not found' };
    }
    
    // Check blockchain balance for pending payments
    if (payment.status === 'pending') {
      const balance = await getUsdtBalance(payment.address);
      
      // Include real-time balance in response
      return {
        success: true,
        payment: {
          ...payment.toObject(),
          currentBalance: balance
        }
      };
    }
    
    return { success: true, payment };
  } catch (error) {
    logger.error(`Error getting payment status: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  processPayments,
  createPayment,
  getPaymentStatus
}; 