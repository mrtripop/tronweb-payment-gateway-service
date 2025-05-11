const mongoose = require('mongoose');
const TronWeb = require('tronweb');
const Payment = require('./src/models/payment.model');
const { toAtomicUnits } = require('./src/utils/helpers');
require('dotenv').config();

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

// Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function updatePaymentAndTransfer() {
  try {
    const paymentId = process.argv[2];
    
    if (!paymentId) {
      console.error('Please provide a payment ID as an argument');
      console.error('Usage: node update-payment.js <payment_id>');
      process.exit(1);
    }
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find the payment
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      console.error(`Payment not found: ${paymentId}`);
      process.exit(1);
    }
    
    console.log(`\n===== Payment Details =====`);
    console.log(`Payment ID: ${payment.paymentId}`);
    console.log(`Address: ${payment.address}`);
    console.log(`Amount: ${payment.amount} USDT`);
    console.log(`Current Status: ${payment.status}`);
    
    // Update payment status to completed
    console.log('\nUpdating payment status to completed...');
    payment.status = 'completed';
    await payment.save();
    console.log('Payment status updated to completed');
    
    // Get main wallet address
    const mainWalletAddress = process.env.MAIN_WALLET_ADDRESS;
    if (!mainWalletAddress) {
      console.error('\nERROR: MAIN_WALLET_ADDRESS not configured in .env file');
      process.exit(1);
    }
    
    console.log(`\nMain wallet address is: ${mainWalletAddress}`);
    
    // Generate TronScan links for the payment address
    const baseUrl = process.env.TRON_FULL_HOST.includes('nile') 
      ? 'https://nile.tronscan.org' 
      : 'https://tronscan.org';
    
    console.log(`\n===== TronScan Links =====`);
    console.log(`Payment address on TronScan: ${baseUrl}/#/address/${payment.address}`);
    console.log(`You can monitor this address on TronScan to track token movements`);
    
    // Store payment address and private key for manual recovery if needed
    console.log(`\n===== Payment Recovery Information =====`);
    console.log(`If automatic transfer fails, you can manually recover funds with:`);
    console.log(`Payment Address: ${payment.address}`);
    console.log(`Private Key: ${payment.privateKey}`);
    console.log(`Import this private key to TronLink wallet to access the funds`);
    
    // Get USDT contract address for the current network
    const USDT_CONTRACT_ADDRESS = getUsdtContractAddress();
    console.log(`\nUsing USDT contract address: ${USDT_CONTRACT_ADDRESS}`);
    
    // Create TronWeb instance using payment's private key
    try {
      const paymentTronWeb = new TronWeb({
        fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
        privateKey: payment.privateKey
      });
      
      // Create USDT contract instance
      const paymentContract = await paymentTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
      console.log('Contract instance created successfully');
      
      // Check current USDT balance
      const balance = await paymentContract.balanceOf(payment.address).call();
      const balanceInUsdt = parseInt(balance.toString()) / 1000000; // Convert from atomic units
      console.log(`Current USDT balance: ${balanceInUsdt} USDT`);
      
      if (balanceInUsdt < payment.amount) {
        console.log(`\nWARNING: Balance (${balanceInUsdt} USDT) is less than expected (${payment.amount} USDT)`);
        console.log('The status has been updated to completed, but transfer will not be attempted');
        return;
      }
      
      // Check if payment address has TRX for transaction fee
      const paymentTrxBalance = await paymentTronWeb.trx.getBalance(payment.address);
      console.log(`Payment address TRX balance: ${paymentTrxBalance / 1_000_000} TRX`);
      
      // If insufficient TRX balance, send some from main wallet
      if (paymentTrxBalance < 5_000_000) { // 5 TRX minimum
        console.log('\nPayment address has insufficient TRX for transaction fees.');
        console.log('Sending TRX from main wallet...');
        
        // Create TronWeb instance with main wallet private key
        const mainTronWeb = new TronWeb({
          fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
          privateKey: process.env.TRON_PRIVATE_KEY
        });
        
        // Send 10 TRX to payment address
        const trxTransaction = await mainTronWeb.trx.sendTransaction(
          payment.address,
          10_000_000 // 10 TRX in Sun units
        );
        
        console.log(`TRX sent to payment address. Transaction ID: ${trxTransaction.txid}`);
        console.log(`Check on TronScan: ${baseUrl}/#/transaction/${trxTransaction.txid}`);
        
        // Wait for the transaction to be confirmed
        console.log('Waiting for TRX transaction to be confirmed...');
        await sleep(10000); // Wait 10 seconds
        
        // Check TRX balance again
        const newTrxBalance = await paymentTronWeb.trx.getBalance(payment.address);
        console.log(`Updated TRX balance: ${newTrxBalance / 1_000_000} TRX`);
        
        if (newTrxBalance < 5_000_000) {
          console.error('\nERROR: Failed to fund the payment address with TRX');
          console.log('Manual transfer will be required');
          return;
        }
      }
      
      // Convert amount to atomic units
      const amountInAtomicUnits = toAtomicUnits(payment.amount);
      console.log(`Amount in atomic units: ${amountInAtomicUnits}`);
      
      // Transfer USDT to main wallet
      console.log(`\nTransferring ${payment.amount} USDT to main wallet...`);
      
      try {
        const transaction = await paymentContract.transfer(
          mainWalletAddress,
          amountInAtomicUnits
        ).send();
        
        console.log(`\nTransfer successful!`);
        console.log(`Transaction ID: ${transaction}`);
        console.log(`Transaction Link: ${baseUrl}/#/transaction/${transaction}`);
        
        // Update payment record with transaction ID
        payment.transferTransactionId = transaction;
        await payment.save();
        console.log('Payment record updated with transfer transaction ID');
      } catch (transferError) {
        console.error('\nERROR transferring USDT:', transferError.message);
        if (transferError.stack) {
          console.error(transferError.stack);
        }
        console.log('\nAuto-transfer failed. Manual transfer required.');
      }
    } catch (error) {
      console.error('\nError setting up TronWeb or contract:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
      console.log('\nRecommendation: Use TronLink wallet with the private key above to manually transfer funds');
    }
    
  } catch (error) {
    console.error('Error updating payment:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
updatePaymentAndTransfer(); 