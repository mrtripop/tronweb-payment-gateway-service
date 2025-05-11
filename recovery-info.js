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

// Get network name
const getNetworkName = () => {
  const network = process.env.TRON_FULL_HOST || '';
  
  if (network.includes('nile')) {
    return 'Nile Testnet';
  } else if (network.includes('shasta')) {
    return 'Shasta Testnet';
  } else {
    return 'Mainnet';
  }
};

async function generateRecoveryInfo() {
  try {
    const paymentId = process.argv[2];
    
    if (!paymentId) {
      console.error('Please provide a payment ID as an argument');
      console.error('Usage: node recovery-info.js <payment_id>');
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
    
    // Get TronScan base URL and network info
    const networkName = getNetworkName();
    const baseUrl = process.env.TRON_FULL_HOST.includes('nile') 
      ? 'https://nile.tronscan.org' 
      : (process.env.TRON_FULL_HOST.includes('shasta') ? 'https://shasta.tronscan.org' : 'https://tronscan.org');
    
    const USDT_CONTRACT_ADDRESS = getUsdtContractAddress();
    
    console.log(`\n==========================================================`);
    console.log(`                PAYMENT RECOVERY INFORMATION                `);
    console.log(`==========================================================`);
    
    console.log(`\n===== PAYMENT DETAILS =====`);
    console.log(`Payment ID: ${payment.paymentId}`);
    console.log(`Address: ${payment.address}`);
    console.log(`Amount: ${payment.amount} USDT`);
    console.log(`Status: ${payment.status}`);
    console.log(`Created: ${payment.createdAt}`);
    
    console.log(`\n===== WALLET INFORMATION =====`);
    console.log(`Network: ${networkName}`);
    console.log(`Payment Address: ${payment.address}`);
    console.log(`Private Key: ${payment.privateKey}`);
    console.log(`Main Wallet Address: ${process.env.MAIN_WALLET_ADDRESS || 'Not configured'}`);
    
    console.log(`\n===== USDT CONTRACT INFORMATION =====`);
    console.log(`USDT Contract Address: ${USDT_CONTRACT_ADDRESS}`);
    
    console.log(`\n===== TRONSCAN LINKS =====`);
    console.log(`Payment Address: ${baseUrl}/#/address/${payment.address}`);
    console.log(`USDT Contract: ${baseUrl}/#/contract/${USDT_CONTRACT_ADDRESS}/transfers`);
    
    if (payment.transactionId) {
      console.log(`Payment Transaction: ${baseUrl}/#/transaction/${payment.transactionId}`);
    }
    
    if (payment.transferTransactionId) {
      console.log(`Transfer Transaction: ${baseUrl}/#/transaction/${payment.transferTransactionId}`);
    }
    
    console.log(`\n===== MANUAL RECOVERY STEPS =====`);
    console.log(`1. Install TronLink wallet browser extension (https://www.tronlink.org/)`);
    console.log(`2. Create a wallet and switch to ${networkName}`);
    console.log(`3. Import the private key: ${payment.privateKey}`);
    console.log(`4. Once imported, you will have access to the payment address: ${payment.address}`);
    console.log(`5. In TronLink, send all USDT to your main wallet: ${process.env.MAIN_WALLET_ADDRESS || 'Your main wallet address'}`);
    console.log(`\nNote: You will need some TRX for transaction fees. For testnet, you can get free TRX from a faucet.`);
    if (networkName === 'Nile Testnet') {
      console.log(`Nile Testnet Faucet: https://nileex.io/join/getJoinPage`);
    } else if (networkName === 'Shasta Testnet') {
      console.log(`Shasta Testnet Faucet: https://www.trongrid.io/shasta`);
    }
    
    console.log(`\n==========================================================`);
    
  } catch (error) {
    console.error('Error generating recovery info:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
generateRecoveryInfo(); 