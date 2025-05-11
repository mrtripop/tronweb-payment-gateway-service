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

// Check if account exists
async function accountExists(tronWeb, address) {
  try {
    const account = await tronWeb.trx.getAccount(address);
    return !!account.address;
  } catch (error) {
    return false;
  }
}

async function transferFunds() {
  try {
    const paymentId = 'order_1746987441544_6049';
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find the payment
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      console.error(`Payment not found: ${paymentId}`);
      process.exit(1);
    }
    
    console.log(`Found payment: ${payment.paymentId}`);
    console.log(`- Address: ${payment.address}`);
    console.log(`- Amount: ${payment.amount} USDT`);
    console.log(`- Status: ${payment.status}`);
    
    // Get main wallet address from .env
    const mainWalletAddress = process.env.MAIN_WALLET_ADDRESS;
    
    if (!mainWalletAddress) {
      console.error('MAIN_WALLET_ADDRESS not configured in .env file');
      process.exit(1);
    }
    
    console.log(`\nPreparing to transfer ${payment.amount} USDT to main wallet: ${mainWalletAddress}`);
    
    // Create TronWeb instance with system private key
    const systemTronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: process.env.TRON_PRIVATE_KEY
    });
    
    // Check if payment address has TRX for transaction fee
    const paymentTrxBalance = await systemTronWeb.trx.getBalance(payment.address);
    console.log(`Payment address TRX balance: ${paymentTrxBalance / 1_000_000} TRX`);
    
    // Check if account exists on the blockchain
    const exists = await accountExists(systemTronWeb, payment.address);
    console.log(`Payment address exists on blockchain: ${exists}`);
    
    // If account doesn't exist or has insufficient TRX balance, send some
    if (!exists || paymentTrxBalance < 10_000_000) {
      console.log(`\nSending 10 TRX to activate the account and cover transaction fees...`);
      
      // Send 10 TRX to payment address (10 million sun)
      const trxTransaction = await systemTronWeb.trx.sendTransaction(
        payment.address,
        10_000_000 // 10 TRX in Sun units
      );
      
      console.log(`TRX sent to payment address. Transaction ID: ${trxTransaction.txid}`);
      
      // Wait for the transaction to be confirmed
      console.log('Waiting for TRX transaction to be confirmed...');
      
      let accountActive = false;
      let attempts = 0;
      
      // Check every 3 seconds, for up to 30 seconds (10 attempts)
      while (!accountActive && attempts < 10) {
        attempts++;
        await sleep(3000);
        accountActive = await accountExists(systemTronWeb, payment.address);
        const balanceCheck = await systemTronWeb.trx.getBalance(payment.address);
        console.log(`Attempt ${attempts}: Account exists: ${accountActive}, TRX Balance: ${balanceCheck / 1_000_000} TRX`);
        
        if (accountActive && balanceCheck > 0) {
          break;
        }
      }
      
      if (!accountActive) {
        console.error('Failed to activate account after multiple attempts');
        process.exit(1);
      }
      
      console.log('Account is now active with TRX balance');
    }
    
    // Wait a bit more for transactions to settle
    console.log('Waiting for blockchain to settle...');
    await sleep(5000);
    
    // Get USDT contract address for the current network
    const USDT_CONTRACT_ADDRESS = getUsdtContractAddress();
    console.log(`Using USDT contract address: ${USDT_CONTRACT_ADDRESS}`);
    console.log(`Network: ${process.env.TRON_FULL_HOST}`);
    
    // Create TronWeb instance with payment's private key
    const tempTronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: payment.privateKey
    });
    
    // Create contract instance
    const contract = await tempTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    
    // Check current USDT balance
    const balance = await contract.balanceOf(payment.address).call();
    const balanceInUsdt = balance / 1000000; // Convert from atomic units
    
    console.log(`\nCurrent USDT balance: ${balanceInUsdt} USDT`);
    
    if (balanceInUsdt < payment.amount) {
      console.error(`\nERROR: Balance (${balanceInUsdt} USDT) is less than expected (${payment.amount} USDT)`);
      process.exit(1);
    }
    
    console.log('\nInitiating USDT transfer...');
    
    // Convert amount to atomic units
    const amountInAtomicUnits = toAtomicUnits(payment.amount);
    
    // Transfer USDT
    const transaction = await contract.transfer(
      mainWalletAddress,
      amountInAtomicUnits
    ).send({
      from: payment.address
    });
    
    console.log(`\nTransfer successful!`);
    console.log(`Transaction ID: ${transaction}`);
    console.log(`\nCheck the transaction on TronScan:`);
    
    if (process.env.TRON_FULL_HOST.includes('nile')) {
      console.log(`https://nile.tronscan.org/#/transaction/${transaction}`);
    } else if (process.env.TRON_FULL_HOST.includes('shasta')) {
      console.log(`https://shasta.tronscan.org/#/transaction/${transaction}`);
    } else {
      console.log(`https://tronscan.org/#/transaction/${transaction}`);
    }
    
    // Update payment record
    payment.transferTransactionId = transaction;
    await payment.save();
    
    console.log('\nPayment record updated with transaction ID');
    
  } catch (error) {
    console.error('Error transferring funds:', error.message);
    if (error.output?.statusCode) {
      console.error('Status code:', error.output.statusCode);
    }
    if (error.output?.statusMessage) {
      console.error('Status message:', error.output.statusMessage);
    }
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the function
transferFunds(); 