const mongoose = require('mongoose');
const TronWeb = require('tronweb');
const Payment = require('./src/models/payment.model');
const { sleep } = require('./src/utils/helpers');
require('dotenv').config();

/**
 * Activate an account with TRX and then transfer USDT to main wallet
 */
async function activateAndTransfer() {
  try {
    // The specific payment ID that needs fixing
    const paymentId = 'order_1747035033865_4886';
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find the payment
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      console.error(`Payment not found: ${paymentId}`);
      process.exit(1);
    }
    
    console.log('\nPayment details:');
    console.log('- Payment ID:', payment.paymentId);
    console.log('- Status:', payment.status);
    console.log('- Address:', payment.address);
    console.log('- Amount:', payment.amount, 'USDT');
    console.log('- Transfer Transaction ID:', payment.transferTransactionId || 'Not set');
    
    // Update status to completed if needed
    if (payment.status !== 'completed') {
      payment.status = 'completed';
      await payment.save();
      console.log('Payment status updated to "completed"');
    }
    
    // USDT contract address
    const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    
    // Create main TronWeb instance
    const tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: process.env.TRON_PRIVATE_KEY
    });
    
    console.log('\nSetting up TRON connection...');
    
    // Get main wallet address
    const mainWalletAddress = process.env.MAIN_WALLET_ADDRESS;
    if (!mainWalletAddress) {
      console.error('Main wallet address not configured');
      process.exit(1);
    }
    
    // Check if account exists
    try {
      console.log('Checking if account exists on blockchain...');
      const account = await tronWeb.trx.getAccount(payment.address);
      console.log('Account exists:', !!account.address);
      
      if (!account.address) {
        console.log('Account does not exist, needs activation with TRX');
        
        // Activate account by sending TRX
        console.log('Sending 10 TRX to activate account...');
        const activationTx = await tronWeb.trx.sendTransaction(
          payment.address,
          10000000 // 10 TRX in Sun
        );
        
        console.log('Activation transaction submitted:', activationTx.txid || activationTx);
        
        // Wait for the activation to be confirmed
        console.log('Waiting for activation confirmation...');
        let activated = false;
        let attempts = 0;
        
        while (!activated && attempts < 12) {
          attempts++;
          await sleep(5000);
          
          try {
            const account = await tronWeb.trx.getAccount(payment.address);
            activated = !!account.address;
            console.log(`Activation check ${attempts}: ${activated ? 'ACTIVATED' : 'PENDING'}`);
            
            if (activated) {
              break;
            }
          } catch (error) {
            console.log(`Error checking activation (attempt ${attempts}):`, error.message);
          }
        }
        
        if (!activated) {
          console.error('Failed to activate account after multiple attempts');
          process.exit(1);
        }
        
        console.log('Account successfully activated!');
      }
    } catch (error) {
      console.log('Error checking account, assuming it needs activation:', error.message);
      
      // Try to activate anyway
      console.log('Sending 10 TRX to activate account...');
      const activationTx = await tronWeb.trx.sendTransaction(
        payment.address,
        10000000 // 10 TRX in Sun
      );
      
      console.log('Activation transaction submitted:', activationTx.txid || activationTx);
      
      // Wait a bit for activation
      console.log('Waiting for activation...');
      await sleep(15000);
    }
    
    // Create TronWeb instance with the payment's private key
    const paymentTronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: payment.privateKey
    });
    
    // Create contract instance
    console.log('Creating contract instance...');
    const contract = await paymentTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    
    // Check balance
    console.log('Checking USDT balance...');
    try {
      const balanceResult = await contract.balanceOf(payment.address).call();
      const currentBalance = parseFloat(balanceResult.toString()) / 1e6;
      
      console.log(`Current USDT balance: ${currentBalance}`);
      
      if (currentBalance < payment.amount) {
        console.error(`Insufficient USDT balance: expected ${payment.amount}, actual ${currentBalance}`);
        process.exit(1);
      }
      
      // Amount in atomic units (6 decimals for USDT)
      const amountInAtomicUnits = Math.floor(payment.amount * 1e6).toString();
      
      console.log(`\nTransferring ${payment.amount} USDT (${amountInAtomicUnits} atomic units) to ${mainWalletAddress}...`);
      
      // Transfer USDT to main wallet
      const transaction = await contract.transfer(
        mainWalletAddress, 
        amountInAtomicUnits
      ).send({
        feeLimit: 100000000, // 100 TRX fee limit
        callValue: 0,
        shouldPollResponse: true
      });
      
      console.log(`\nTransaction submitted: ${transaction}`);
      
      // Verify the transaction was confirmed
      console.log('\nWaiting for transaction confirmation...');
      
      let confirmed = false;
      let attempts = 0;
      
      while (!confirmed && attempts < 12) { // Check for up to 1 minute
        attempts++;
        await sleep(5000); // Wait 5 seconds between checks
        
        try {
          const tx = await paymentTronWeb.trx.getTransaction(transaction);
          confirmed = tx && tx.ret && tx.ret[0] && tx.ret[0].contractRet === 'SUCCESS';
          
          console.log(`Confirmation check ${attempts}: ${confirmed ? 'CONFIRMED' : 'PENDING'}`);
          
          if (confirmed) {
            break;
          }
        } catch (error) {
          console.log(`Error checking confirmation (attempt ${attempts}):`, error.message);
        }
      }
      
      if (confirmed) {
        // Update payment in database
        payment.transferTransactionId = transaction;
        await payment.save();
        
        console.log('\nSUCCESS: Transfer completed and confirmed');
        console.log(`Transaction ID: ${transaction}`);
        
        // Final verification
        const updatedPayment = await Payment.findOne({ paymentId });
        console.log('\nUpdated payment details:');
        console.log('- Payment ID:', updatedPayment.paymentId);
        console.log('- Status:', updatedPayment.status);
        console.log('- Transfer Transaction ID:', updatedPayment.transferTransactionId);
      } else {
        console.error('\nTRANSACTION NOT CONFIRMED after multiple attempts');
      }
    } catch (error) {
      console.error('\nERROR during balance check or transfer:', error.message);
    }
  } catch (error) {
    console.error('Error in activate and transfer:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
activateAndTransfer(); 