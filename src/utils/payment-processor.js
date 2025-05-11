const Payment = require('../models/payment.model');
const tronService = require('./tron.service');
const { sleep } = require('./helpers');
const { logPaymentJourney, logError, PAYMENT_STAGES } = require('./logger');

// Maximum number of consecutive failures before backing off
const MAX_CONSECUTIVE_FAILURES = 3;
let consecutiveFailures = 0;

/**
 * Process pending payments
 */
async function processPayments() {
  try {
    logPaymentJourney('SYSTEM', 'PROCESSING_CYCLE_STARTED', { timestamp: new Date().toISOString() });
    
    // Find all pending payments and payments marked as completed but without a transfer transaction
    const paymentsToProcess = await Payment.find({ 
      $or: [
        { status: 'pending' },
        { status: 'completed', transferTransactionId: { $exists: false } },
        { status: 'completed', transferTransactionId: null }
      ]
    }).sort({ createdAt: 1 }); // Process oldest first
    
    if (paymentsToProcess.length === 0) {
      logPaymentJourney('SYSTEM', 'NO_PENDING_PAYMENTS', { timestamp: new Date().toISOString() });
      console.log('No payments to process');
      // Reset consecutive failures since there's nothing to process
      consecutiveFailures = 0;
      return;
    }
    
    logPaymentJourney('SYSTEM', 'PAYMENTS_TO_PROCESS_FOUND', { 
      count: paymentsToProcess.length, 
      paymentIds: paymentsToProcess.map(p => p.paymentId) 
    });
    
    console.log(`Found ${paymentsToProcess.length} payments to process`);
    
    // Track how many payments were successfully processed
    let successCount = 0;
    let failureCount = 0;
    
    // Process each payment
    for (const payment of paymentsToProcess) {
      try {
        const { paymentId, address, amount, status, privateKey } = payment;
        logPaymentJourney(paymentId, PAYMENT_STAGES.PROCESSING_STARTED, { 
          address, 
          amount,
          currentStatus: status
        });
        
        console.log(`Processing payment ${paymentId} (status: ${status})`);
        
        // Check if payment has been received
        if (status === 'pending') {
          logPaymentJourney(paymentId, 'CHECKING_BLOCKCHAIN', { address });
          
          let isPaid = false;
          try {
            // Retry payment check a few times if needed
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                isPaid = await tronService.checkPayment(address, amount);
                if (isPaid) break;
                
                // If not paid and not on last attempt, wait before retrying
                if (attempt < 3) {
                  await sleep(3000);
                }
              } catch (checkError) {
                logError(paymentId, 'PAYMENT_CHECK_ATTEMPT_FAILED', checkError, {
                  address,
                  amount,
                  attempt
                });
                // Wait longer between retries
                await sleep(5000 * attempt);
              }
            }
          } catch (finalCheckError) {
            logError(paymentId, 'PAYMENT_CHECK_COMPLETELY_FAILED', finalCheckError, {
              address,
              amount
            });
            // Move to next payment
            failureCount++;
            continue;
          }
          
          if (isPaid) {
            logPaymentJourney(paymentId, PAYMENT_STAGES.PAYMENT_DETECTED, { 
              address, 
              amount 
            });
            
            // Update payment status to completed
            payment.status = 'completed';
            await payment.save();
            
            logPaymentJourney(paymentId, PAYMENT_STAGES.STATUS_CHANGED, { 
              oldStatus: 'pending', 
              newStatus: 'completed' 
            });
            
            console.log(`Payment ${paymentId} marked as completed`);
            
            // Immediately try to transfer funds after marking as completed
            // Continue to the fund transfer section below
          } else {
            logPaymentJourney(paymentId, 'PAYMENT_NOT_DETECTED', { 
              address, 
              amount 
            });
            console.log(`Payment ${paymentId} - no funds detected yet`);
            continue; // Skip to next payment
          }
        }
        
        // Now check if we need to transfer funds to main wallet
        // This happens for payments with status 'completed' but no transfer transaction ID
        if (status === 'completed' || payment.status === 'completed') {
          // Check if transfer has already been done
          if (payment.transferTransactionId) {
            logPaymentJourney(paymentId, 'TRANSFER_ALREADY_DONE', { 
              transferTransactionId: payment.transferTransactionId 
            });
            console.log(`Payment ${paymentId} already transferred to main wallet`);
            successCount++;
            continue; // Skip to next payment
          }
          
          // Double check the actual USDT balance before trying to transfer
          let actualBalance = 0;
          try {
            actualBalance = await tronService.getUsdtBalance(address);
            
            logPaymentJourney(paymentId, 'PRE_TRANSFER_BALANCE_CHECK', {
              address,
              actualBalance,
              expectedAmount: amount
            });
            
            if (actualBalance < amount) {
              logError(paymentId, 'INSUFFICIENT_BALANCE_FOR_TRANSFER', new Error(`Insufficient balance: ${actualBalance} < ${amount}`), {
                address,
                actualBalance,
                expectedAmount: amount
              });
              
              // If the balance is too low, continue to next payment
              failureCount++;
              continue;
            }
          } catch (balanceCheckError) {
            logError(paymentId, 'PRE_TRANSFER_BALANCE_CHECK_FAILED', balanceCheckError, {
              address
            });
            // Even if balance check fails, try the transfer anyway
          }
          
          // Transfer to main wallet
          logPaymentJourney(paymentId, PAYMENT_STAGES.TRANSFERRING_TO_MAIN, { 
            fromAddress: address,
            toAddress: process.env.MAIN_WALLET_ADDRESS,
            amount 
          });
          
          try {
            // Try to transfer with up to 3 retries
            let transactionId = null;
            let transferSuccess = false;
            
            for (let transferAttempt = 1; transferAttempt <= 3; transferAttempt++) {
              try {
                transactionId = await tronService.transferToMainWallet(
                  address,
                  privateKey,
                  amount
                );
                
                if (transactionId) {
                  transferSuccess = true;
                  break;
                }
              } catch (transferAttemptError) {
                logError(paymentId, 'TRANSFER_ATTEMPT_FAILED', transferAttemptError, {
                  address,
                  attempt: transferAttempt,
                  maxAttempts: 3
                });
                
                // Wait between attempts with exponential backoff
                if (transferAttempt < 3) {
                  await sleep(5000 * Math.pow(2, transferAttempt - 1));
                }
              }
            }
            
            if (!transferSuccess) {
              throw new Error(`Failed to transfer funds after multiple attempts for payment ${paymentId}`);
            }
            
            // Update payment with transaction ID
            payment.transferTransactionId = transactionId;
            await payment.save();
            
            logPaymentJourney(paymentId, PAYMENT_STAGES.TRANSFER_COMPLETED, { 
              transactionId 
            });
            
            console.log(`Payment ${paymentId} funds transferred to main wallet. Transaction ID: ${transactionId}`);
            
            // Call merchant callback if available
            if (payment.callbackUrl) {
              logPaymentJourney(paymentId, PAYMENT_STAGES.MERCHANT_CALLBACK_SENT, { 
                callbackUrl: payment.callbackUrl 
              });
              // Call the merchant's callback URL (implementation omitted)
            }
            
            // Increment success counter
            successCount++;
          } catch (transferError) {
            failureCount++;
            logError(paymentId, 'TRANSFER_ERROR', transferError, { 
              fromAddress: address,
              amount
            });
            console.error(`Error transferring payment ${paymentId} to main wallet:`, transferError.message);
          }
        }
      } catch (error) {
        failureCount++;
        const paymentId = payment.paymentId;
        logError(paymentId, PAYMENT_STAGES.ERROR, error, { 
          context: 'processPayment',
          address: payment.address,
          amount: payment.amount
        });
        
        console.error(`Error processing payment ${paymentId}:`, error);
      }
    }
    
    logPaymentJourney('SYSTEM', 'PROCESSING_CYCLE_COMPLETED', { 
      timestamp: new Date().toISOString(),
      processed: paymentsToProcess.length,
      success: successCount,
      failures: failureCount
    });
    
    // Update consecutive failures tracking
    if (failureCount > 0 && successCount === 0) {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
    }
  } catch (error) {
    consecutiveFailures++;
    logError('SYSTEM', 'PROCESSOR_ERROR', error, { context: 'processPayments' });
    console.error('Error in payment processor:', error);
  }
}

/**
 * Start the payment processor
 */
async function startPaymentProcessor() {
  logPaymentJourney('SYSTEM', 'PAYMENT_PROCESSOR_STARTED', { timestamp: new Date().toISOString() });
  console.log('Starting payment processor');
  
  // Run forever
  while (true) {
    try {
      await processPayments();
    } catch (error) {
      consecutiveFailures++;
      logError('SYSTEM', 'UNEXPECTED_PROCESSOR_ERROR', error);
      console.error('Unexpected error in payment processor:', error);
    }
    
    // Dynamic backoff based on consecutive failures
    let waitTime = 60000; // Default: 1 minute
    
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      // Exponential backoff with max of 5 minutes
      const backoffMultiplier = Math.min(Math.pow(2, consecutiveFailures - MAX_CONSECUTIVE_FAILURES), 5);
      waitTime = waitTime * backoffMultiplier;
      
      console.log(`Too many consecutive failures (${consecutiveFailures}), backing off for ${waitTime/1000} seconds`);
    }
    
    // Wait before checking again
    await sleep(waitTime);
  }
}

// Specific function to force processing a single payment immediately
async function processSpecificPayment(paymentId) {
  try {
    console.log(`Manually processing payment ${paymentId}`);
    
    // Find the payment
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      console.error(`Payment not found: ${paymentId}`);
      return false;
    }
    
    // Process just this payment
    try {
      const { address, amount, status, privateKey } = payment;
      
      // If pending, check if payment received
      if (status === 'pending') {
        console.log(`Checking payment ${paymentId} for receipt of funds...`);
        const isPaid = await tronService.checkPayment(address, amount);
        
        if (isPaid) {
          console.log(`Payment ${paymentId} has been received, updating status...`);
          payment.status = 'completed';
          await payment.save();
          console.log(`Payment ${paymentId} marked as completed`);
        } else {
          console.log(`Payment ${paymentId} - no funds detected yet`);
          return false;
        }
      }
      
      // If completed but not transferred, transfer funds
      if ((status === 'completed' || payment.status === 'completed') && !payment.transferTransactionId) {
        console.log(`Transferring funds for payment ${paymentId} to main wallet...`);
        
        const transactionId = await tronService.transferToMainWallet(
          address,
          privateKey,
          amount
        );
        
        payment.transferTransactionId = transactionId;
        await payment.save();
        
        console.log(`Payment ${paymentId} funds transferred to main wallet. Transaction ID: ${transactionId}`);
        return true;
      } else if (payment.transferTransactionId) {
        console.log(`Payment ${paymentId} already has transfer transaction ID: ${payment.transferTransactionId}`);
        return true;
      }
      
      return payment.status === 'completed';
    } catch (error) {
      console.error(`Error processing payment ${paymentId}:`, error);
      return false;
    }
  } catch (error) {
    console.error(`Error finding payment ${paymentId}:`, error);
    return false;
  }
}

module.exports = {
  startPaymentProcessor,
  processPayments,
  processSpecificPayment
}; 