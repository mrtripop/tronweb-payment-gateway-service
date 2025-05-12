const TronWeb = require('tronweb');
const Payment = require('../models/payment.model');
const { logPaymentJourney, logError, PAYMENT_STAGES } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Create log file path
const logFilePath = path.join(process.cwd(), 'logs', 'main-wallet-monitor.log');

// Helper function to write to log file
function writeToLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  
  // Write to log file
  fs.appendFileSync(logFilePath, logEntry);
  
  // Also log to console
  console.log(message);
}

// Create TronWeb instance
const tronWeb = new TronWeb({
  fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY
});

// TRC20 USDT contract address on the TRON network
const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
// Nile testnet USDT contract address
const NILE_USDT_CONTRACT_ADDRESS = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';

// Get main wallet address from env
let MAIN_WALLET_ADDRESS = null;

// Helper function to sleep
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Last time we checked for transactions
let lastCheckTime = Date.now() - (24 * 60 * 60 * 1000); // Start by checking the last 24 hours

/**
 * Get USDT transactions for the main wallet since the last check
 */
async function getRecentTransactions() {
  try {
    // Refresh the address in case environment variable was loaded after this module
    MAIN_WALLET_ADDRESS = process.env.MAIN_WALLET_ADDRESS;
    
    // Get USDT transactions for the main wallet
    const tronScanApiUrl = process.env.TRON_FULL_HOST.includes('nile') 
      ? 'https://nile.trongrid.io'
      : 'https://api.trongrid.io';
    
    const currentTime = Date.now();
    
    writeToLog(`[DEBUG] Fetching transactions from ${new Date(lastCheckTime).toISOString()} to ${new Date(currentTime).toISOString()}`);
    writeToLog(`[DEBUG] API URL: ${tronScanApiUrl}`);
    writeToLog(`[DEBUG] MAIN_WALLET_ADDRESS: ${MAIN_WALLET_ADDRESS}`);
    writeToLog(`[DEBUG] USDT_CONTRACT_ADDRESS: ${USDT_CONTRACT_ADDRESS}`);
    
    // Call TronGrid API to get token transfers
    const url = `${tronScanApiUrl}/v1/accounts/${MAIN_WALLET_ADDRESS}/transactions/trc20?limit=100&min_timestamp=${lastCheckTime}`;
    // const url = `${tronScanApiUrl}/v1/accounts/${MAIN_WALLET_ADDRESS}/transactions/trc20?limit=100&min_timestamp=${lastCheckTime}&contract_address=${USDT_CONTRACT_ADDRESS}`;
    
    writeToLog(`[DEBUG] Request URL: ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();
    writeToLog(`[DEBUG] Response: ${JSON.stringify(data)}`);
    
    // Update last check time
    lastCheckTime = currentTime;
    
    if (!data.success) {
      writeToLog(`[ERROR] API request failed: ${data.error || 'Unknown error'}`);
      throw new Error(`Failed to get transactions: ${data.error || 'Unknown error'}`);
    }
    
    const transactions = data.data || [];
    writeToLog(`[DEBUG] Received ${transactions.length} total transactions`);
    
    // Filter only incoming transactions (where to_address is our main wallet)
    // Also filter for the USDT token if specified
    const incomingTransactions = transactions.filter(tx => {
      // Check it's going to our wallet
      if (tx.to !== MAIN_WALLET_ADDRESS) return false;
      
      // Check if it's USDT on either mainnet or testnet
      if (tx.token_info && tx.token_info.address) {
        const tokenAddress = tx.token_info.address.toLowerCase();
        const isMainnetUSDT = tokenAddress === USDT_CONTRACT_ADDRESS.toLowerCase();
        const isTestnetUSDT = tokenAddress === NILE_USDT_CONTRACT_ADDRESS.toLowerCase();
        
        return isMainnetUSDT || isTestnetUSDT;
      }
      
      return false;
    });
    
    writeToLog(`[DEBUG] Filtered to ${incomingTransactions.length} incoming transactions`);
    
    // Log transaction details for debugging
    if (incomingTransactions.length > 0) {
      writeToLog('[DEBUG] Incoming transactions:');
      incomingTransactions.forEach((tx, idx) => {
        const tokenSymbol = tx.token_info ? tx.token_info.symbol : 'TOKEN';
        writeToLog(`[DEBUG] [${idx + 1}] TX ID: ${tx.transaction_id}, From: ${tx.from}, Value: ${parseInt(tx.value) / 1e6} ${tokenSymbol}, Time: ${new Date(tx.block_timestamp).toISOString()}`);
      });
    }
    
    return incomingTransactions;
  } catch (error) {
    logError('MAIN_WALLET', 'TRANSACTION_FETCH_ERROR', error, {});
    writeToLog(`[ERROR] Error fetching main wallet transactions: ${error.message}`);
    writeToLog(error.stack);
    return [];
  }
}

/**
 * Process a single transaction and match it to a pending payment
 */
async function processTransaction(transaction) {
  try {
    const { from, to, block_timestamp, transaction_id, value, type, token_info } = transaction;
    
    writeToLog(`\n[DEBUG] Processing transaction ${transaction_id}`);
    writeToLog(`[DEBUG] Transaction details: from=${from}, to=${to}, type=${type}, value=${value}, time=${new Date(block_timestamp).toISOString()}`);
    
    // Get contract address from token_info if available
    const contract_address = token_info?.address;
    
    writeToLog(`[DEBUG] Token info: ${JSON.stringify(token_info || {})}`);
    writeToLog(`[DEBUG] Contract address: ${contract_address || 'N/A'}`);
    
    // Skip if not a transfer or not for USDT
    if (type !== 'Transfer') {
      writeToLog(`[DEBUG] Skipping transaction: Not a Transfer (type=${type})`);
      return;
    }
    
    // Check if the token is USDT (either mainnet or testnet version)
    if (!contract_address) {
      writeToLog(`[DEBUG] Skipping transaction: No contract address found`);
      return;
    }
    
    const tokenAddress = contract_address.toLowerCase();
    const isMainnetUSDT = tokenAddress === USDT_CONTRACT_ADDRESS.toLowerCase();
    const isTestnetUSDT = tokenAddress === NILE_USDT_CONTRACT_ADDRESS.toLowerCase();
    
    if (!isMainnetUSDT && !isTestnetUSDT) {
      writeToLog(`[DEBUG] Skipping transaction: Not USDT (contract=${contract_address})`);
      return;
    }
    
    writeToLog(`[DEBUG] Valid USDT transaction (${isTestnetUSDT ? 'testnet' : 'mainnet'} USDT)`);
    
    // Get USDT value (need to convert from atomic units)
    const usdtValue = parseInt(value) / 1e6;
    writeToLog(`[DEBUG] USDT Value: ${usdtValue}`);
    
    logPaymentJourney('MAIN_WALLET', 'TRANSACTION_PROCESSING', {
      from,
      to,
      transaction_id,
      usdtValue
    });
    
    // Check all pending payments that match the amount
    writeToLog(`[DEBUG] Searching for pending payments with amount=${usdtValue} and useMainWallet=true`);
    const pendingPayments = await Payment.find({
      status: 'pending',
      amount: usdtValue,
      useMainWallet: true
    });
    
    writeToLog(`[DEBUG] Found ${pendingPayments.length} potential matching payments by amount`);
    
    if (pendingPayments.length === 0) {
      writeToLog(`[DEBUG] No matching payments found by amount`);
      logPaymentJourney('MAIN_WALLET', 'NO_MATCHING_PAYMENT', {
        usdtValue,
        transaction_id
      });
      return;
    }
    
    // Log pending payment details
    pendingPayments.forEach((payment, idx) => {
      writeToLog(`[DEBUG] [${idx + 1}] Payment ID: ${payment.paymentId}, Amount: ${payment.amount}, Memo: ${payment.memo}, Created: ${payment.createdAt}`);
    });
    
    // Try to find payment with matching memo (in case multiple payments with same amount)
    // Check transaction memo if available in the transaction data
    let matchedPayment = null;
    let memo = null;
    
    try {
      // Try to get transaction details to check for memo
      writeToLog(`[DEBUG] Fetching full transaction details for ${transaction_id} to extract memo`);
      const txDetails = await tronWeb.trx.getTransaction(transaction_id);
      
      writeToLog(`[DEBUG] Transaction details received: ${txDetails ? 'Yes' : 'No'}`);
      writeToLog(`[DEBUG] Raw data available: ${txDetails && txDetails.raw_data ? 'Yes' : 'No'}`);
      writeToLog(`[DEBUG] Data field available: ${txDetails && txDetails.raw_data && txDetails.raw_data.data ? 'Yes' : 'No'}`);
      
      // Extract memo if available
      if (txDetails && txDetails.raw_data && txDetails.raw_data.data) {
        memo = Buffer.from(txDetails.raw_data.data, 'hex').toString('utf8');
        writeToLog(`[DEBUG] Extracted memo: "${memo}"`);
        
        // If memo is found, try to find payment with this memo
        if (memo) {
          writeToLog(`[DEBUG] Searching for payment with memo: "${memo}"`);
          const memoPayment = pendingPayments.find(p => p.memo === memo);
          if (memoPayment) {
            writeToLog(`[DEBUG] Found matching payment by memo: ${memoPayment.paymentId}`);
            matchedPayment = memoPayment;
          } else {
            writeToLog(`[DEBUG] No payment found with exact memo match`);
          }
        }
      } else {
        writeToLog(`[DEBUG] No memo data found in transaction`);
      }
    } catch (e) {
      // If memo extraction fails, continue with amount-based matching
      writeToLog(`[DEBUG] Error extracting memo: ${e.message}`);
      writeToLog(e.stack);
    }
    
    // If no payment matched by memo, use the oldest pending payment with matching amount
    if (!matchedPayment && pendingPayments.length > 0) {
      writeToLog(`[DEBUG] Falling back to amount-based matching, using oldest payment`);
      // Sort by creation date (oldest first)
      pendingPayments.sort((a, b) => a.createdAt - b.createdAt);
      matchedPayment = pendingPayments[0];
      writeToLog(`[DEBUG] Selected payment ${matchedPayment.paymentId} (created ${matchedPayment.createdAt})`);
    }
    
    if (matchedPayment) {
      writeToLog(`[DEBUG] Updating payment ${matchedPayment.paymentId} to completed status`);
      // Mark payment as completed
      matchedPayment.status = 'completed';
      matchedPayment.transactionId = transaction_id;
      
      // Since this payment was made directly to the main wallet,
      // mark it as transferred with a special transaction ID
      if (matchedPayment.useMainWallet === true) {
        matchedPayment.transferTransactionId = 'MAIN_WALLET_SELF_TRANSFER_SKIPPED';
      }
      
      matchedPayment.updatedAt = new Date();
      
      await matchedPayment.save();
      writeToLog(`[DEBUG] Payment saved successfully`);
      
      logPaymentJourney(matchedPayment.paymentId, PAYMENT_STAGES.PAYMENT_COMPLETED, {
        transactionId: transaction_id,
        amount: usdtValue,
        memo: memo || 'none'
      });
      
      // If payment was made directly to main wallet, also log that no transfer is needed
      if (matchedPayment.useMainWallet === true) {
        logPaymentJourney(matchedPayment.paymentId, PAYMENT_STAGES.TRANSFER_COMPLETED, { 
          transactionId: 'MAIN_WALLET_SELF_TRANSFER_SKIPPED',
          reason: 'Payment was made directly to main wallet'
        });
      }
      
      writeToLog(`✅ Payment ${matchedPayment.paymentId} completed with transaction ${transaction_id}`);
      
      // If there's a callback URL, call it
      if (matchedPayment.callbackUrl) {
        try {
          writeToLog(`[DEBUG] Sending callback to ${matchedPayment.callbackUrl}`);
          const callbackPayload = {
            paymentId: matchedPayment.paymentId,
            status: 'completed',
            transactionId: transaction_id,
            amount: matchedPayment.amount
          };
          
          // Call callback URL
          const callbackResponse = await fetch(matchedPayment.callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(callbackPayload)
          });
          
          if (!callbackResponse.ok) {
            throw new Error(`Callback returned status ${callbackResponse.status}`);
          }
          
          writeToLog(`[DEBUG] Callback completed successfully`);
          logPaymentJourney(matchedPayment.paymentId, 'CALLBACK_SUCCESS', {
            callbackUrl: matchedPayment.callbackUrl
          });
        } catch (callbackError) {
          writeToLog(`[DEBUG] Callback error: ${callbackError.message}`);
          logError(matchedPayment.paymentId, 'CALLBACK_ERROR', callbackError, {
            callbackUrl: matchedPayment.callbackUrl
          });
        }
      }
    } else {
      writeToLog(`[DEBUG] No payment could be matched to this transaction`);
      logPaymentJourney('MAIN_WALLET', 'NO_MATCHING_PAYMENT_FOUND', {
        usdtValue,
        transaction_id,
        memo: memo || 'none'
      });
    }
  } catch (error) {
    logError('MAIN_WALLET', 'TRANSACTION_PROCESSING_ERROR', error, {
      transaction_id: transaction.transaction_id
    });
    writeToLog(`[ERROR] Error processing transaction ${transaction.transaction_id}: ${error.message}`);
    writeToLog(error.stack);
  }
}

/**
 * Run the main wallet monitor to check for incoming USDT transactions
 */
async function runMainWalletMonitor() {
  try {
    // Make sure to refresh environment variables in case they changed
    MAIN_WALLET_ADDRESS = process.env.MAIN_WALLET_ADDRESS;
    
    if (!MAIN_WALLET_ADDRESS) {
      writeToLog('[ERROR] MAIN_WALLET_ADDRESS not set in environment variables');
      return;
    }
    
    writeToLog('\n====================== MAIN WALLET MONITOR ======================');
    writeToLog(`🔍 Starting main wallet monitor at ${new Date().toISOString()}`);
    writeToLog(`🔍 Monitoring address: ${MAIN_WALLET_ADDRESS}`);
    
    // Check for transactions
    writeToLog('🔄 Fetching recent transactions...');
    const transactions = await getRecentTransactions();
    writeToLog(`✅ Found ${transactions.length} recent transactions to process`);
    
    // Process each transaction
    if (transactions.length > 0) {
      writeToLog('🔄 Processing transactions:');
      for (let i = 0; i < transactions.length; i++) {
        writeToLog(`[${i+1}/${transactions.length}] Processing transaction ${transactions[i].transaction_id}`);
        await processTransaction(transactions[i]);
      }
    }
    
    writeToLog('✅ Main wallet monitor completed');
    writeToLog('===============================================================\n');
  } catch (error) {
    writeToLog(`[ERROR] Error in main wallet monitor: ${error.message}`);
    writeToLog(error.stack);
  }
}

/**
 * Start the main wallet monitor as a background process
 */
function startMainWalletMonitor(intervalMs = 60000) {
  // Get the latest environment variables
  MAIN_WALLET_ADDRESS = process.env.MAIN_WALLET_ADDRESS;
  
  writeToLog(`[INFO] Starting main wallet monitor with interval ${intervalMs}ms`);
  writeToLog(`[INFO] Using TRON network: ${process.env.TRON_FULL_HOST || 'https://api.trongrid.io'}`);
  writeToLog(`[INFO] Using USDT contract: ${USDT_CONTRACT_ADDRESS}`);
  writeToLog(`[INFO] Using main wallet address: ${MAIN_WALLET_ADDRESS}`);
  writeToLog(`[INFO] Logs will be written to: ${logFilePath}`);
  
  // Run immediately
  runMainWalletMonitor();
  
  // Then run at the specified interval
  setInterval(runMainWalletMonitor, intervalMs);
}

module.exports = {
  startMainWalletMonitor,
  runMainWalletMonitor,
  getRecentTransactions,
  processTransaction
}; 