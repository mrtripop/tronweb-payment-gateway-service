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

async function directTransfer() {
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
    
    // Create TronWeb instance with system private key
    const tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: process.env.TRON_PRIVATE_KEY
    });
    
    // Get USDT contract address for the current network
    const USDT_CONTRACT_ADDRESS = getUsdtContractAddress();
    console.log(`\nUsing USDT contract address: ${USDT_CONTRACT_ADDRESS}`);
    console.log(`Network: ${process.env.TRON_FULL_HOST}`);
    
    // Create contract instance
    try {
      const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
      
      // Get mainnet contract
      const mainnetContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
      const nileContract = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
      
      // Check balances using both contract addresses
      console.log('\nChecking balances with different contract addresses:');
      
      // Try mainnet contract
      try {
        const mainnetContractInstance = await tronWeb.contract().at(mainnetContract);
        const mainnetBalance = await mainnetContractInstance.balanceOf(payment.address).call();
        const mainnetBalanceUsdt = mainnetBalance.toString() / 1000000;
        console.log(`- Mainnet contract balance: ${mainnetBalanceUsdt} USDT`);
      } catch (error) {
        console.log(`- Mainnet contract check failed: ${error.message ? error.message : error}`);
      }
      
      // Try Nile testnet contract
      try {
        const nileContractInstance = await tronWeb.contract().at(nileContract);
        const nileBalance = await nileContractInstance.balanceOf(payment.address).call();
        const nileBalanceUsdt = nileBalance.toString() / 1000000;
        console.log(`- Nile contract balance: ${nileBalanceUsdt} USDT`);
      } catch (error) {
        console.log(`- Nile contract check failed: ${error.message ? error.message : error}`);
      }
      
      // Try calling contract function to view tokens
      console.log('\nAttempting to check if payment address has any TRC20 tokens...');
      
      // Fetch a list of available methods
      const functionList = await contract.methods;
      console.log('Available contract methods:', Object.keys(functionList).join(', '));
    } catch (error) {
      console.error('Error creating contract instance:', error.message ? error.message : error);
    }
    
    // Get the current main wallet address
    const mainWalletAddress = process.env.MAIN_WALLET_ADDRESS;
    console.log(`\nMain wallet address: ${mainWalletAddress}`);
    
    // Check main wallet TRX balance
    const mainWalletBalance = await tronWeb.trx.getBalance(mainWalletAddress);
    console.log(`Main wallet TRX balance: ${mainWalletBalance / 1000000} TRX`);
    
    // Option 1: If we can't directly transfer USDT, we can add this payment address to a "to check" list
    console.log('\nSince we are having issues with direct transfer, here is what you can do:');
    console.log('1. Visit the USDT contract on TronScan to check if the address has a balance:');
    
    if (process.env.TRON_FULL_HOST.includes('nile')) {
      console.log(`   https://nile.tronscan.org/#/contract/${USDT_CONTRACT_ADDRESS}/transfers`);
      console.log(`   Then search for address: ${payment.address}`);
    } else {
      console.log(`   https://tronscan.org/#/contract/${USDT_CONTRACT_ADDRESS}/transfers`);
      console.log(`   Then search for address: ${payment.address}`);
    }
    
    console.log('\n2. If there is a balance, you can use the Tronlink wallet to import the private key:');
    console.log(`   Private key: ${payment.privateKey}`);
    console.log('   Then manually transfer the funds to your main wallet');
    
    // Store this information in the database for reference
    payment.manualTransferNeeded = true;
    payment.transferNotes = 'Manual transfer required due to blockchain issues';
    await payment.save();
    
    console.log('\nPayment record updated with manual transfer flag');
    
  } catch (error) {
    console.error('Error in direct transfer:', error.message ? error.message : error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the function
directTransfer(); 