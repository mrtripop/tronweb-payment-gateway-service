require('dotenv').config();
const mongoose = require('mongoose');
const TronWeb = require('tronweb');
const Payment = require('../src/models/payment.model');
const { logPaymentJourney, logError, PAYMENT_STAGES } = require('../src/utils/logger');

// Initialize TronWeb with the main wallet's private key
const tronWeb = new TronWeb({
  fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY
});

// Constants
const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const MAIN_WALLET_ADDRESS = process.env.MAIN_WALLET_ADDRESS;

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Manually activate a specific payment address and recover funds
 * 
 * @param {string} paymentId - Payment ID to recover funds from
 * @returns {Promise<void>}
 */
async function activateAndRecoverFunds(paymentId) {
  console.log('='.repeat(80));
  console.log(`STARTING RECOVERY PROCESS FOR PAYMENT: ${paymentId}`);
  console.log('='.repeat(80));

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Find the payment
    const payment = await Payment.findOne({ paymentId });
    if (!payment) {
      console.error(`❌ Payment with ID ${paymentId} not found!`);
      process.exit(1);
    }

    console.log(`📋 Found payment record for ID: ${paymentId}`);
    console.log(`💰 Amount: ${payment.amount} USDT`);
    console.log(`📬 Temp wallet address: ${payment.address}`);
    console.log(`🔍 Status: ${payment.status}`);
    console.log(`🔰 Account activated: ${payment.accountActivated ? 'Yes' : 'No'}`);

    // Check if account exists on blockchain
    let isActivated = false;
    try {
      console.log('\n🔍 Checking if account exists on blockchain...');
      const account = await tronWeb.trx.getAccount(payment.address);
      isActivated = !!account.address;
      console.log(`🔍 Account exists: ${isActivated ? 'Yes' : 'No'}`);
    } catch (error) {
      console.log('❌ Error checking account, assuming it needs activation');
      isActivated = false;
    }

    // Activate account if needed
    if (!isActivated) {
      console.log('\n🚀 Account needs activation...');
      // Send TRX to activate the account - using 20 TRX to ensure there's enough for transactions
      const activationAmount = 20000000; // 20 TRX in SUN units
      console.log(`💸 Sending ${activationAmount/1000000} TRX to activate account...`);
      
      const activationTx = await tronWeb.trx.sendTransaction(
        payment.address,
        activationAmount.toString()
      );
      
      console.log(`✅ Activation transaction submitted: ${activationTx.txid}`);
      
      // Store the activation transaction ID
      payment.activationTransactionId = activationTx.txid;
      payment.activationAttempts += 1;
      await payment.save();
      
      // Wait for activation to be confirmed
      console.log('\n⏳ Waiting for activation confirmation...');
      let activated = false;
      let attempts = 0;
      
      while (!activated && attempts < 12) {
        attempts++;
        await sleep(5000); // Wait 5 seconds between checks
        
        try {
          const account = await tronWeb.trx.getAccount(payment.address);
          activated = !!account.address;
          console.log(`⏳ Activation check ${attempts}: ${activated ? '✅ ACTIVATED' : '⏳ PENDING'}`);
          
          if (activated) {
            // Update payment record
            payment.accountActivated = true;
            await payment.save();
            break;
          }
        } catch (error) {
          console.log(`❌ Error checking activation (attempt ${attempts}): ${error.message}`);
        }
      }
      
      if (!activated) {
        console.error('❌ Failed to activate account after multiple attempts. Please try again later.');
        process.exit(1);
      }
      
      console.log('✅ Account successfully activated!');
      
      // Wait a bit longer to ensure blockchain state is updated
      console.log('⏳ Waiting for blockchain confirmation...');
      await sleep(10000);
    } else {
      console.log('✅ Account is already activated');
      
      if (!payment.accountActivated) {
        payment.accountActivated = true;
        await payment.save();
      }
    }

    // Create TronWeb instance with the payment's private key
    const paymentTronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: payment.privateKey
    });

    // 1. First check USDT balance
    console.log('\n🔍 Checking USDT balance...');
    const contract = await paymentTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    let usdtBalance = 0;
    
    try {
      const balanceResult = await contract.balanceOf(payment.address).call();
      usdtBalance = parseFloat(balanceResult.toString()) / 1e6;
      console.log(`💰 Current USDT balance: ${usdtBalance}`);
    } catch (error) {
      console.error(`❌ Error checking USDT balance: ${error.message}`);
    }

    // 2. Transfer USDT to main wallet if available
    if (usdtBalance > 0) {
      console.log(`\n🚀 Transferring ${usdtBalance} USDT to main wallet...`);
      
      try {
        // Amount in atomic units (6 decimals for USDT)
        const amountInAtomicUnits = Math.floor(usdtBalance * 1e6).toString();
        
        const transferTx = await contract.transfer(
          MAIN_WALLET_ADDRESS, 
          amountInAtomicUnits
        ).send({
          feeLimit: 100000000, // 100 TRX fee limit
          callValue: 0,
          shouldPollResponse: true
        });
        
        console.log(`✅ USDT transfer transaction submitted: ${transferTx}`);
        
        // Update payment record
        payment.transferTransactionId = transferTx;
        payment.status = 'completed';
        await payment.save();
        
        // Wait for transaction confirmation
        console.log('\n⏳ Waiting for USDT transfer confirmation...');
        let confirmed = false;
        let attempts = 0;
        
        while (!confirmed && attempts < 12) {
          attempts++;
          await sleep(5000);
          
          try {
            const tx = await paymentTronWeb.trx.getTransaction(transferTx);
            confirmed = tx && tx.ret && tx.ret[0] && tx.ret[0].contractRet === 'SUCCESS';
            console.log(`⏳ Confirmation check ${attempts}: ${confirmed ? '✅ CONFIRMED' : '⏳ PENDING'}`);
            
            if (confirmed) {
              break;
            }
          } catch (error) {
            console.log(`❌ Error checking USDT confirmation (attempt ${attempts}): ${error.message}`);
          }
        }
        
        console.log(confirmed ? '✅ USDT transfer confirmed!' : '⚠️ Could not confirm USDT transfer.');
      } catch (error) {
        console.error(`❌ Error transferring USDT: ${error.message}`);
      }
    } else {
      console.log('ℹ️ No USDT balance to transfer');
    }

    // 3. Check TRX balance and transfer back to main wallet
    console.log('\n🔍 Checking TRX balance...');
    try {
      const trxBalance = await paymentTronWeb.trx.getBalance(payment.address);
      const trxBalanceInTRX = trxBalance / 1e6;
      console.log(`💰 Current TRX balance: ${trxBalanceInTRX} TRX`);
      
      if (trxBalance > 1000000) { // Leave 1 TRX for potential future operations
        const transferAmount = trxBalance - 1000000;
        console.log(`\n🚀 Transferring ${transferAmount/1e6} TRX back to main wallet...`);
        
        try {
          const trxTransferTx = await paymentTronWeb.trx.sendTransaction(
            MAIN_WALLET_ADDRESS,
            transferAmount.toString()
          );
          
          console.log(`✅ TRX transfer transaction submitted: ${trxTransferTx.txid}`);
          
          // Wait for transaction confirmation
          console.log('\n⏳ Waiting for TRX transfer confirmation...');
          await sleep(5000);
          
          console.log('✅ Recovery process completed successfully!');
        } catch (error) {
          console.error(`❌ Error transferring TRX back: ${error.message}`);
        }
      } else {
        console.log('ℹ️ TRX balance too low to transfer back');
      }
    } catch (error) {
      console.error(`❌ Error checking TRX balance: ${error.message}`);
    }

  } catch (error) {
    console.error(`❌ Error in recovery process: ${error.message}`);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
    console.log('='.repeat(80));
  }
}

// Check for command line arguments
if (process.argv.length < 3) {
  console.error('Usage: node activate-and-recover-funds.js <paymentId>');
  process.exit(1);
}

const paymentId = process.argv[2];
activateAndRecoverFunds(paymentId).then(() => {
  console.log('Recovery script completed');
  process.exit(0);
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 