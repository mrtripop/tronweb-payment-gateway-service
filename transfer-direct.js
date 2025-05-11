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

async function waitForTrxConfirmation(tronWeb, address, maxAttempts = 15, interval = 10000) {
  console.log(`Waiting for TRX to be confirmed on address ${address}...`);
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    const balance = await tronWeb.trx.getBalance(address);
    console.log(`Attempt ${attempts}/${maxAttempts}: TRX balance = ${balance / 1_000_000} TRX`);
    
    if (balance >= 5_000_000) { // 5 TRX minimum
      console.log('✅ Sufficient TRX balance detected!');
      return true;
    }
    
    console.log(`Waiting ${interval/1000} seconds before next check...`);
    await sleep(interval);
  }
  
  console.log('❌ TRX confirmation timed out after all attempts');
  return false;
}

async function transferDirect() {
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
    
    // Get main wallet address
    const mainWalletAddress = process.env.MAIN_WALLET_ADDRESS;
    
    if (!mainWalletAddress) {
      console.error('MAIN_WALLET_ADDRESS not configured in .env file');
      process.exit(1);
    }
    
    console.log(`\nMain wallet address: ${mainWalletAddress}`);
    
    // Get TronScan base URL
    const baseUrl = process.env.TRON_FULL_HOST.includes('nile') 
      ? 'https://nile.tronscan.org' 
      : 'https://tronscan.org';
    
    // Create TronWeb instance with main wallet's private key
    const mainTronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: process.env.TRON_PRIVATE_KEY
    });
    
    // Get USDT contract address for the current network
    const USDT_CONTRACT_ADDRESS = getUsdtContractAddress();
    console.log(`\nUsing USDT contract address: ${USDT_CONTRACT_ADDRESS}`);
    console.log(`Network: ${process.env.TRON_FULL_HOST}`);
    
    // Create contract instance for main wallet
    const mainContract = await mainTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    
    // Create TronWeb instance with payment's private key
    const paymentTronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: payment.privateKey
    });
    
    // Check payment address USDT balance
    const balance = await mainContract.balanceOf(payment.address).call();
    const balanceInUsdt = parseInt(balance.toString()) / 1000000; // Convert from atomic units
    
    console.log(`\nCurrent USDT balance: ${balanceInUsdt} USDT`);
    
    if (balanceInUsdt < payment.amount) {
      console.error(`\nERROR: Balance (${balanceInUsdt} USDT) is less than expected (${payment.amount} USDT)`);
      process.exit(1);
    }
    
    // Check payment address TRX balance
    const paymentTrxBalance = await paymentTronWeb.trx.getBalance(payment.address);
    console.log(`Payment address TRX balance: ${paymentTrxBalance / 1_000_000} TRX`);
    
    // If insufficient TRX balance, send some from main wallet
    if (paymentTrxBalance < 5_000_000) { // 5 TRX minimum
      console.log('\nPayment address has insufficient TRX for transaction fees.');
      console.log('Sending TRX from main wallet...');
      
      // Get main wallet TRX balance
      const mainWalletTrxBalance = await mainTronWeb.trx.getBalance(mainWalletAddress);
      console.log(`Main wallet TRX balance: ${mainWalletTrxBalance / 1_000_000} TRX`);
      
      if (mainWalletTrxBalance < 20_000_000) {
        console.error('Main wallet has insufficient TRX to fund transaction fees');
        process.exit(1);
      }
      
      // Send 15 TRX to payment address
      const trxTransaction = await mainTronWeb.trx.sendTransaction(
        payment.address,
        15_000_000 // 15 TRX in Sun units
      );
      
      console.log(`TRX sent to payment address. Transaction ID: ${trxTransaction.txid}`);
      console.log(`Check on TronScan: ${baseUrl}/#/transaction/${trxTransaction.txid}`);
      
      // Wait for the transaction to be confirmed
      const trxConfirmed = await waitForTrxConfirmation(paymentTronWeb, payment.address);
      
      if (!trxConfirmed) {
        console.error('\nFailed to fund the payment address with TRX after multiple attempts');
        console.log('\n===== Manual Transfer Required =====');
        console.log('Please use TronLink wallet with the following private key to transfer funds manually:');
        console.log(`Payment Address: ${payment.address}`);
        console.log(`Private Key: ${payment.privateKey}`);
        console.log(`Main Wallet: ${mainWalletAddress}`);
        process.exit(1);
      }
    }
    
    // Create contract instance for payment wallet
    const paymentContract = await paymentTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    
    // Convert amount to atomic units
    const amountInAtomicUnits = toAtomicUnits(payment.amount);
    
    // Transfer USDT to main wallet
    console.log(`\nTransferring ${payment.amount} USDT to main wallet...`);
    
    const transaction = await paymentContract.transfer(
      mainWalletAddress,
      amountInAtomicUnits
    ).send();
    
    console.log(`\nTransfer successful!`);
    console.log(`Transaction ID: ${transaction}`);
    console.log(`Check on TronScan: ${baseUrl}/#/transaction/${transaction}`);
    
    // Update payment record
    payment.transferTransactionId = transaction;
    await payment.save();
    
    console.log('\nPayment record updated with transfer transaction ID');
    
  } catch (error) {
    console.error('Error transferring funds:', error.message);
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
transferDirect(); 