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

async function checkPendingPayments() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find payments with pending or completed status
    const payments = await Payment.find({ 
      status: { $in: ['pending', 'completed'] } 
    }).lean();
    
    console.log(`\nFound ${payments.length} payments with pending or completed status:`);
    
    // Get USDT contract address
    const USDT_CONTRACT_ADDRESS = getUsdtContractAddress();
    console.log(`Using USDT contract address: ${USDT_CONTRACT_ADDRESS}`);
    console.log(`Network: ${process.env.TRON_FULL_HOST}\n`);
    
    // Get TronScan base URL
    const baseUrl = process.env.TRON_FULL_HOST.includes('nile') 
      ? 'https://nile.tronscan.org' 
      : 'https://tronscan.org';
    
    // Check each payment
    for (const payment of payments) {
      console.log(`\n----- Payment ${payment.paymentId} -----`);
      console.log(`Address: ${payment.address}`);
      console.log(`Amount: ${payment.amount} USDT`);
      console.log(`Status: ${payment.status}`);
      console.log(`Created: ${payment.createdAt}`);
      
      if (payment.transactionId) {
        console.log(`Payment Transaction ID: ${payment.transactionId}`);
        console.log(`TronScan Payment TX: ${baseUrl}/#/transaction/${payment.transactionId}`);
      }
      
      // Check if there is a transfer transaction ID
      if (payment.transferTransactionId) {
        console.log(`\n✅ FUNDS TRANSFERRED`);
        console.log(`Transfer Transaction ID: ${payment.transferTransactionId}`);
        console.log(`TronScan Transfer TX: ${baseUrl}/#/transaction/${payment.transferTransactionId}`);
      } else {
        console.log(`\n⚠️ NO TRANSFER TRANSACTION RECORDED`);
        
        // Create an independent TronWeb instance for each check
        const tronWeb = new TronWeb({
          fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io'
        });
        
        try {
          // Create contract instance
          const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
          
          // Check USDT balance
          const balance = await contract.balanceOf(payment.address).call();
          const balanceInUsdt = parseInt(balance.toString()) / 1000000;
          
          console.log(`Current USDT balance: ${balanceInUsdt} USDT`);
          
          if (balanceInUsdt > 0) {
            console.log(`TronScan Address: ${baseUrl}/#/address/${payment.address}`);
            
            if (balanceInUsdt >= payment.amount) {
              console.log(`⚠️ Funds need to be transferred to main wallet`);
              console.log(`Run: node transfer-direct.js ${payment.paymentId}`);
            }
          } else {
            console.log(`No USDT balance on this address`);
          }
        } catch (error) {
          console.log(`Could not check USDT balance automatically: ${error.message || 'Unknown error'}`);
          console.log(`TronScan Address: ${baseUrl}/#/address/${payment.address}`);
          console.log(`Please check manually using TronScan`);
          console.log(`To attempt fund transfer: node transfer-direct.js ${payment.paymentId}`);
        }
      }
      
      console.log(`\nTronLink Import Info:`);
      console.log(`Private Key: ${payment.privateKey}`);
    }
    
  } catch (error) {
    console.error('Error checking pending payments:', error.message);
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
checkPendingPayments(); 