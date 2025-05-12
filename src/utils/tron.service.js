const TronWeb = require('tronweb');
const { toAtomicUnits, fromAtomicUnits, sleep } = require('./helpers');
const { logPaymentJourney, logError, PAYMENT_STAGES } = require('./logger');

// Create TronWeb instance
const tronWeb = new TronWeb({
  fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY
});

// Get the appropriate USDT contract address based on the network
const getUsdtContractAddress = () => {
  const network = process.env.TRON_FULL_HOST || '';
  
  if (network.includes('nile')) {
    return 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'; // Nile testnet
  } else if (network.includes('shasta')) {
    return 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj'; // Shasta testnet
  } else {
    return process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // Mainnet default
  }
};

// TRC20 USDT contract address on the TRON network
const USDT_CONTRACT_ADDRESS = getUsdtContractAddress();

// Log the contract address at startup
console.log(`[TRON] Using USDT contract address: ${USDT_CONTRACT_ADDRESS}`);
console.log(`[TRON] Network: ${process.env.TRON_FULL_HOST}`);

/**
 * Get USDT balance for an address
 * @param {string} address - TRON address to check
 * @returns {number} Balance in USDT
 */
exports.getUsdtBalance = async (address) => {
  try {
    logPaymentJourney('BLOCKCHAIN', 'GET_USDT_BALANCE_STARTED', { 
      address,
      contract: USDT_CONTRACT_ADDRESS,
      network: process.env.TRON_FULL_HOST
    });
    
    // Create contract instance
    const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    
    // Call balanceOf function - passing the address as a parameter
    // This avoids the owner_address error
    const balance = await contract.balanceOf(address).call({
      _isConstant: true,  // This is a view/pure function call
      from: address       // Explicitly specify the address
    });
    
    // Convert from atomic units to USDT
    const balanceInUsdt = fromAtomicUnits(balance.toString());
    
    logPaymentJourney('BLOCKCHAIN', 'GET_USDT_BALANCE_COMPLETED', { 
      address, 
      balanceRaw: balance.toString(), 
      balanceUsdt: balanceInUsdt 
    });
    
    return balanceInUsdt;
  } catch (error) {
    logError('BLOCKCHAIN', 'GET_USDT_BALANCE_ERROR', error, { 
      address,
      contract: USDT_CONTRACT_ADDRESS,
      network: process.env.TRON_FULL_HOST
    });
    console.error('Error getting USDT balance:', error);
    throw error;
  }
};

/**
 * Check if a payment has been made
 * @param {string} address - TRON address to check
 * @param {number} expectedAmount - Expected amount in USDT
 * @returns {boolean} Whether the payment has been made
 */
exports.checkPayment = async (address, expectedAmount) => {
  try {
    logPaymentJourney('BLOCKCHAIN', 'CHECK_PAYMENT_STARTED', { 
      address, 
      expectedAmount 
    });
    
    const balance = await exports.getUsdtBalance(address);
    
    // Check if the balance is at least the expected amount
    const isPaid = balance >= expectedAmount;
    
    logPaymentJourney('BLOCKCHAIN', 'CHECK_PAYMENT_COMPLETED', { 
      address, 
      balance, 
      expectedAmount, 
      isPaid 
    });
    
    return isPaid;
  } catch (error) {
    logError('BLOCKCHAIN', 'CHECK_PAYMENT_ERROR', error, { address, expectedAmount });
    console.error('Error checking payment:', error);
    throw error;
  }
};

/**
 * Get TRX balance for an address
 * @param {string} address - TRON address to check
 * @returns {number} Balance in TRX
 */
exports.getTrxBalance = async (address) => {
  try {
    logPaymentJourney('BLOCKCHAIN', 'GET_TRX_BALANCE_STARTED', { address });
    
    const balanceInSun = await tronWeb.trx.getBalance(address);
    const balanceInTrx = balanceInSun / 1000000; // Convert from Sun to TRX
    
    logPaymentJourney('BLOCKCHAIN', 'GET_TRX_BALANCE_COMPLETED', { 
      address, 
      balanceInSun, 
      balanceInTrx 
    });
    
    return balanceInTrx;
  } catch (error) {
    logError('BLOCKCHAIN', 'GET_TRX_BALANCE_ERROR', error, { address });
    console.error('Error getting TRX balance:', error);
    throw error;
  }
};

/**
 * Send TRX to an address and wait for confirmation
 * @param {string} toAddress - Address to send TRX to
 * @param {number} amountTrx - Amount of TRX to send
 * @returns {Promise<boolean>} - Whether the transaction was confirmed
 */
exports.sendTrxAndWaitForConfirmation = async (toAddress, amountTrx = 15) => {
  try {
    // Ensure we have a private key in the environment
    if (!process.env.TRON_PRIVATE_KEY) {
      throw new Error('Private key not configured for TRX sending');
    }
    
    const amountSun = amountTrx * 1000000; // Convert from TRX to Sun
    
    logPaymentJourney('BLOCKCHAIN', 'SEND_TRX_STARTED', { 
      toAddress, 
      amountTrx, 
      amountSun 
    });
    
    // Send TRX - explicitly use the tronWeb instance with the private key
    const transaction = await tronWeb.trx.sendTransaction(
      toAddress,
      amountSun
    );
    
    logPaymentJourney('BLOCKCHAIN', 'SEND_TRX_TRANSACTION_SENT', { 
      toAddress, 
      amountTrx, 
      transactionId: transaction.txid 
    });
    
    // Wait for confirmation
    let confirmed = false;
    let attempts = 0;
    const maxAttempts = 20; // More attempts (20 x 5 seconds = 100 seconds max wait time)
    
    while (!confirmed && attempts < maxAttempts) {
      attempts++;
      // Wait 5 seconds between checks
      await sleep(5000);
      
      // Check current balance
      const currentBalance = await tronWeb.trx.getBalance(toAddress);
      const currentBalanceTrx = currentBalance / 1000000;
      
      logPaymentJourney('BLOCKCHAIN', 'SEND_TRX_CONFIRMATION_CHECK', { 
        attempt: attempts, 
        toAddress, 
        currentBalance, 
        currentBalanceTrx 
      });
      
      if (currentBalance >= amountSun * 0.9) { // Account for fees
        confirmed = true;
        logPaymentJourney('BLOCKCHAIN', 'SEND_TRX_CONFIRMED', { 
          toAddress, 
          amountTrx, 
          attempts, 
          finalBalance: currentBalanceTrx 
        });
      }
    }
    
    if (!confirmed) {
      logPaymentJourney('BLOCKCHAIN', 'SEND_TRX_CONFIRMATION_TIMEOUT', { 
        toAddress, 
        amountTrx, 
        attempts 
      });
    }
    
    return confirmed;
  } catch (error) {
    logError('BLOCKCHAIN', 'SEND_TRX_ERROR', error, { toAddress, amountTrx });
    console.error('Error sending TRX:', error);
    return false;
  }
};

/**
 * Transfer USDT to the main wallet
 * @param {string} fromAddress - Address to transfer from
 * @param {string} fromPrivateKey - Private key of the from address
 * @param {number} amount - Amount to transfer in USDT
 * @returns {string} Transaction ID
 */
exports.transferToMainWallet = async (fromAddress, fromPrivateKey, amount) => {
  try {
    logPaymentJourney('BLOCKCHAIN', 'TRANSFER_TO_MAIN_STARTED', { 
      fromAddress, 
      amount 
    });
    
    // Get main wallet address
    const mainWalletAddress = process.env.MAIN_WALLET_ADDRESS;
    
    if (!mainWalletAddress) {
      const error = new Error('Main wallet address not configured');
      logError('BLOCKCHAIN', 'TRANSFER_CONFIG_ERROR', error);
      throw error;
    }
    
    // Check if fromAddress is already the main wallet address
    if (fromAddress === mainWalletAddress) {
      logPaymentJourney('BLOCKCHAIN', 'TRANSFER_SKIPPED_MAIN_WALLET', {
        fromAddress,
        mainWalletAddress,
        amount
      });
      // Return a special transaction ID to indicate it was skipped (not an error)
      return 'MAIN_WALLET_SELF_TRANSFER_SKIPPED';
    }
    
    // Create a temporary TronWeb instance with the payment private key
    const tempTronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: fromPrivateKey
    });
    
    // First, ensure the account is activated on the blockchain
    const isActivated = await exports.activateAccountIfNeeded(fromAddress);
    
    if (!isActivated) {
      throw new Error(`Failed to activate account ${fromAddress} for transfer`);
    }
    
    // Check TRX balance of payment address
    const trxBalance = await tempTronWeb.trx.getBalance(fromAddress);
    const trxBalanceInTrx = trxBalance / 1000000;
    
    logPaymentJourney('BLOCKCHAIN', 'TRANSFER_TRX_CHECK', { 
      fromAddress, 
      trxBalance, 
      trxBalanceInTrx 
    });
    
    // If TRX balance is low, send some TRX to cover fees
    if (trxBalance < 5000000) { // Less than 5 TRX
      logPaymentJourney('BLOCKCHAIN', 'TRANSFER_TRX_LOW', { 
        fromAddress, 
        trxBalance, 
        trxBalanceInTrx 
      });
      
      // Send 10 TRX to cover fees
      const trxSent = await exports.sendTrxAndWaitForConfirmation(fromAddress, 10);
      
      if (!trxSent) {
        throw new Error('Failed to send TRX for transaction fees');
      }
      
      // Wait 5 seconds to ensure transaction is fully processed
      await sleep(5000);
      
      // Check TRX balance again to confirm
      const newTrxBalance = await tempTronWeb.trx.getBalance(fromAddress);
      logPaymentJourney('BLOCKCHAIN', 'TRANSFER_TRX_FUNDED', { 
        fromAddress, 
        newTrxBalance: newTrxBalance / 1000000 
      });
    }
    
    // Create contract instance
    const contract = await tempTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    
    // Get current USDT balance
    const balanceResult = await contract.balanceOf(fromAddress).call();
    const currentBalance = fromAtomicUnits(balanceResult.toString());
    
    logPaymentJourney('BLOCKCHAIN', 'TRANSFER_BALANCE_CHECK', { 
      fromAddress, 
      currentBalance, 
      expectedAmount: amount 
    });
    
    // Verify that the balance is at least the expected amount
    if (currentBalance < amount) {
      const error = new Error(`Insufficient USDT balance: expected ${amount}, actual ${currentBalance}`);
      logError('BLOCKCHAIN', 'TRANSFER_INSUFFICIENT_BALANCE', error, { 
        fromAddress, 
        currentBalance, 
        expectedAmount: amount 
      });
      throw error;
    }
    
    // Amount in atomic units
    const amountInAtomicUnits = toAtomicUnits(amount);
    
    // Maximum retries for transfer attempts
    const maxRetries = 3;
    let transactionId = null;
    let retries = 0;
    let success = false;
    
    while (!success && retries < maxRetries) {
      try {
        // Increment retry counter
        retries++;
        
        logPaymentJourney('BLOCKCHAIN', 'TRANSFER_ATTEMPT', { 
          fromAddress, 
          toAddress: mainWalletAddress, 
          amount, 
          attempt: retries 
        });
        
        // Transfer USDT to main wallet
        const transaction = await contract.transfer(
          mainWalletAddress, 
          amountInAtomicUnits
        ).send({
          feeLimit: 100000000, // 100 TRX fee limit
          callValue: 0,
          shouldPollResponse: true
        });
        
        transactionId = transaction;
        
        logPaymentJourney('BLOCKCHAIN', 'TRANSFER_TRANSACTION_SUBMITTED', { 
          fromAddress, 
          toAddress: mainWalletAddress, 
          amount, 
          transactionId, 
          attempt: retries 
        });
        
        // Verify the transaction was confirmed
        let confirmed = false;
        let confirmationChecks = 0;
        const maxConfirmationChecks = 12; // Check for up to 1 minute (12 x 5 seconds)
        
        while (!confirmed && confirmationChecks < maxConfirmationChecks) {
          // Wait 5 seconds between checks
          await sleep(5000);
          confirmationChecks++;
          
          try {
            const tx = await tempTronWeb.trx.getTransaction(transactionId);
            confirmed = tx && tx.ret && tx.ret[0] && tx.ret[0].contractRet === 'SUCCESS';
            
            logPaymentJourney('BLOCKCHAIN', 'TRANSFER_CONFIRMATION_CHECK', { 
              transactionId, 
              confirmationChecks, 
              confirmed, 
              txStatus: tx?.ret?.[0]?.contractRet 
            });
            
            if (confirmed) {
              success = true;
              break;
            }
          } catch (confirmError) {
            logError('BLOCKCHAIN', 'TRANSFER_CONFIRMATION_ERROR', confirmError, { 
              transactionId, 
              confirmationChecks 
            });
            // Continue to next check even if error
          }
        }
        
        // Verify the recipient received the funds
        if (success) {
          try {
            // Wait a bit more to ensure blockchain state is updated
            await sleep(5000);
            
            // Check main wallet balance to verify funds arrived
            const mainContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
            const mainBalanceBefore = await mainContract.balanceOf(mainWalletAddress).call();
            
            logPaymentJourney('BLOCKCHAIN', 'TRANSFER_RECIPIENT_BALANCE_CHECK', { 
              mainWalletAddress, 
              balanceRaw: mainBalanceBefore.toString(), 
              balanceUsdt: fromAtomicUnits(mainBalanceBefore.toString()) 
            });
            
            // Additional verification that the transaction is properly recorded in tron network
            const events = await tempTronWeb.getEventResult(fromAddress, {
              eventName: 'Transfer',
              onlyConfirmed: true,
              limit: 10
            });
            
            const transferEvent = events.find(event => 
              event.transaction === transactionId && 
              event.result.from === fromAddress.toLowerCase()
            );
            
            if (transferEvent) {
              logPaymentJourney('BLOCKCHAIN', 'TRANSFER_EVENT_CONFIRMED', { 
                transactionId,
                transferEvent: transferEvent.result
              });
            } else {
              logPaymentJourney('BLOCKCHAIN', 'TRANSFER_EVENT_NOT_FOUND', { 
                transactionId,
                eventsFound: events.length
              });
              // Continue anyway as the transaction may still be successful
            }
          } catch (verificationError) {
            logError('BLOCKCHAIN', 'TRANSFER_VERIFICATION_ERROR', verificationError, { 
              transactionId 
            });
            // Continue anyway as this is just an additional verification
          }
        }
        
        // If transaction was successful, break the retry loop
        if (success) {
          break;
        }
      } catch (transferError) {
        logError('BLOCKCHAIN', 'TRANSFER_ERROR', transferError, { 
          fromAddress, 
          toAddress: mainWalletAddress, 
          amount, 
          attempt: retries 
        });
        
        // Wait before retrying
        await sleep(10000 * retries); // Exponential backoff: 10s, 20s, 30s
      }
    }
    
    if (!success) {
      throw new Error(`Failed to transfer funds after ${maxRetries} attempts`);
    }
    
    logPaymentJourney('BLOCKCHAIN', 'TRANSFER_TO_MAIN_COMPLETED', { 
      fromAddress, 
      toAddress: mainWalletAddress, 
      amount, 
      transactionId, 
      attempts: retries 
    });
    
    return transactionId;
  } catch (error) {
    logError('BLOCKCHAIN', 'TRANSFER_TO_MAIN_ERROR', error, { 
      fromAddress, 
      amount 
    });
    console.error('Error transferring to main wallet:', error);
    throw error;
  }
};

/**
 * Monitor an address for incoming USDT transactions
 * @param {string} address - TRON address to monitor
 * @param {number} expectedAmount - Expected amount in USDT
 * @param {number} timeoutSeconds - Timeout in seconds
 * @returns {Promise<Object>} Object containing success status and transaction info
 */
exports.monitorAddress = async (address, expectedAmount, timeoutSeconds = 600) => {
  try {
    logPaymentJourney('BLOCKCHAIN', 'MONITOR_ADDRESS_STARTED', { 
      address, 
      expectedAmount, 
      timeoutSeconds 
    });
    
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    
    // Initial balance
    let initialBalance = await exports.getUsdtBalance(address);
    let currentBalance = initialBalance;
    
    logPaymentJourney('BLOCKCHAIN', 'MONITOR_INITIAL_BALANCE', { 
      address, 
      initialBalance 
    });
    
    // Monitor until timeout
    let checkCount = 0;
    while (Date.now() - startTime < timeoutMs) {
      // Wait 10 seconds between checks
      await sleep(10000);
      checkCount++;
      
      // Check current balance
      currentBalance = await exports.getUsdtBalance(address);
      
      logPaymentJourney('BLOCKCHAIN', 'MONITOR_CHECK', { 
        address, 
        checkCount, 
        currentBalance, 
        expectedAmount 
      });
      
      // If balance increased by expected amount
      if (currentBalance >= expectedAmount) {
        const result = {
          success: true,
          initialBalance,
          finalBalance: currentBalance,
          receivedAmount: currentBalance - initialBalance
        };
        
        logPaymentJourney('BLOCKCHAIN', 'MONITOR_ADDRESS_PAYMENT_DETECTED', result);
        
        return result;
      }
    }
    
    // Timeout reached
    const result = {
      success: false,
      initialBalance,
      finalBalance: currentBalance,
      receivedAmount: currentBalance - initialBalance
    };
    
    logPaymentJourney('BLOCKCHAIN', 'MONITOR_ADDRESS_TIMEOUT', {
      ...result,
      timeoutSeconds,
      checkCount
    });
    
    return result;
  } catch (error) {
    logError('BLOCKCHAIN', 'MONITOR_ADDRESS_ERROR', error, { 
      address, 
      expectedAmount 
    });
    console.error('Error monitoring address:', error);
    throw error;
  }
};

/**
 * Check if an account exists on the blockchain and activate it if needed
 * @param {string} address - The address to check and activate
 * @returns {Promise<boolean>} - Whether the account is now active
 */
exports.activateAccountIfNeeded = async (address) => {
  try {
    logPaymentJourney('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_CHECK_STARTED', { address });
    
    // Get main wallet address
    const mainWalletAddress = process.env.MAIN_WALLET_ADDRESS;
    
    // Skip activation for main wallet - assume it's already activated
    if (address === mainWalletAddress) {
      logPaymentJourney('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_SKIPPED_MAIN_WALLET', { 
        address,
        mainWalletAddress
      });
      return true;
    }
    
    // Ensure we have a private key set
    if (!process.env.TRON_PRIVATE_KEY) {
      throw new Error('TRON_PRIVATE_KEY is not set in environment variables');
    }
    
    // Make sure tronWeb has the privateKey set
    const privateKey = process.env.TRON_PRIVATE_KEY;
    tronWeb.setPrivateKey(privateKey);
    
    // Check if account exists
    try {
      const account = await tronWeb.trx.getAccount(address);
      const exists = !!account.address;
      
      logPaymentJourney('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_CHECK_RESULT', { 
        address, 
        exists 
      });
      
      if (exists) {
        return true; // Account already active
      }
    } catch (error) {
      logError('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_CHECK_ERROR', error, { address });
      // Continue to activation attempt
    }
    
    // Account doesn't exist, activate it by sending TRX
    logPaymentJourney('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_STARTED', { address });
    
    // Send 15 TRX to activate the account
    const activationTx = await tronWeb.trx.sendTransaction(
      address,
      15000000 // 15 TRX in Sun
    );
    
    logPaymentJourney('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_TX_SENT', { 
      address, 
      txid: activationTx.txid || activationTx 
    });
    
    // Wait for the activation to be confirmed
    let activated = false;
    let attempts = 0;
    const maxAttempts = 12; // Check for up to 1 minute
    
    while (!activated && attempts < maxAttempts) {
      attempts++;
      // Wait 5 seconds between checks
      await sleep(5000);
      
      try {
        const account = await tronWeb.trx.getAccount(address);
        activated = !!account.address;
        
        logPaymentJourney('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_CHECK_ATTEMPT', { 
          address, 
          attempt: attempts, 
          activated 
        });
        
        if (activated) {
          break;
        }
      } catch (error) {
        logError('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_CHECK_ATTEMPT_ERROR', error, { 
          address, 
          attempt: attempts 
        });
      }
    }
    
    if (activated) {
      logPaymentJourney('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_COMPLETED', { address });
    } else {
      logError('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_FAILED', new Error('Failed to activate account after multiple attempts'), { 
        address, 
        attempts 
      });
    }
    
    return activated;
  } catch (error) {
    logError('BLOCKCHAIN', 'ACTIVATE_ACCOUNT_ERROR', error, { address });
    console.error('Error activating account:', error);
    return false;
  }
}; 