const mongoose = require('mongoose');
const TronWeb = require('tronweb');
const Payment = require('./src/models/payment.model');
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

async function getTransactionDetails() {
  try {
    const paymentId = process.argv[2] || 'order_1746989255500_9503';
    
    if (!paymentId) {
      console.error('Please provide a payment ID as an argument');
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
    console.log(`Status: ${payment.status}`);
    console.log(`Created: ${payment.createdAt}`);
    
    if (payment.transactionId) {
      console.log(`Transaction ID: ${payment.transactionId}`);
    }
    
    if (payment.transferTransactionId) {
      console.log(`Transfer Transaction ID: ${payment.transferTransactionId}`);
    }
    
    // Create TronWeb instance
    const tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io'
    });
    
    // Get USDT contract address for the current network
    const USDT_CONTRACT_ADDRESS = getUsdtContractAddress();
    console.log(`\nUsing USDT contract address: ${USDT_CONTRACT_ADDRESS}`);
    console.log(`Network: ${process.env.TRON_FULL_HOST}`);
    
    // Create contract instance and check USDT balance
    try {
      const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
      const balance = await contract.balanceOf(payment.address).call();
      const balanceInUsdt = balance / 1000000; // Convert from atomic units
      console.log(`\nCurrent USDT balance: ${balanceInUsdt} USDT`);
      
      // Generate TronScan URLs for checking transactions
      console.log(`\n===== TronScan Links =====`);
      const baseUrl = process.env.TRON_FULL_HOST.includes('nile') 
        ? 'https://nile.tronscan.org' 
        : 'https://tronscan.org';
      
      console.log(`Address on TronScan: ${baseUrl}/#/address/${payment.address}`);
      console.log(`USDT Contract on TronScan: ${baseUrl}/#/contract/${USDT_CONTRACT_ADDRESS}/transfers`);
      
      if (payment.transactionId) {
        console.log(`Payment Transaction: ${baseUrl}/#/transaction/${payment.transactionId}`);
      }
      
      if (payment.transferTransactionId) {
        console.log(`Transfer Transaction: ${baseUrl}/#/transaction/${payment.transferTransactionId}`);
      }
      
      // If the payment is stuck in pending state but has a balance, provide a command to fix it
      if (payment.status === 'pending' && balanceInUsdt >= payment.amount) {
        console.log(`\n===== Manual Resolution =====`);
        console.log(`Payment has sufficient balance but status is still pending.`);
        console.log(`To update status and trigger automatic transfer, run:`);
        console.log(`node update-payment.js ${payment.paymentId}`);
      }
    } catch (error) {
      console.error('\nError checking balance:', error.message);
      
      // Still provide TronScan links even if balance check fails
      console.log(`\n===== TronScan Links =====`);
      const baseUrl = process.env.TRON_FULL_HOST.includes('nile') 
        ? 'https://nile.tronscan.org' 
        : 'https://tronscan.org';
      
      console.log(`Address on TronScan: ${baseUrl}/#/address/${payment.address}`);
      console.log(`USDT Contract on TronScan: ${baseUrl}/#/contract/${USDT_CONTRACT_ADDRESS}/transfers`);
      
      if (payment.transactionId) {
        console.log(`Payment Transaction: ${baseUrl}/#/transaction/${payment.transactionId}`);
      }
      
      if (payment.transferTransactionId) {
        console.log(`Transfer Transaction: ${baseUrl}/#/transaction/${payment.transferTransactionId}`);
      }
      
      console.log(`\n===== Manual Resolution =====`);
      console.log(`Since we couldn't check the balance automatically, please check the transaction manually using the TronScan links above.`);
      console.log(`If you confirm the payment has been received, run this command to update the status and transfer funds:`);
      console.log(`node update-payment.js ${payment.paymentId}`);
    }
    
  } catch (error) {
    console.error('Error getting transaction details:', error.message);
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
getTransactionDetails(); 