/**
 * Utility to manually check a payment on the TRON blockchain
 */
const dotenv = require('dotenv');
const TronWeb = require('tronweb');
const { fromAtomicUnits } = require('./helpers');
const Payment = require('../models/payment.model');
const mongoose = require('mongoose');

// Load environment variables
dotenv.config();

// Create TronWeb instance
const tronWeb = new TronWeb({
  fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY
});

// USDT contract address (different for each network)
// - Mainnet: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
// - Nile Testnet: TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf
// - Shasta Testnet: TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj
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

const USDT_CONTRACT_ADDRESS = getUsdtContractAddress();

/**
 * Get USDT balance for an address with debug info
 */
async function getUsdtBalance(address) {
  try {
    console.log(`\nChecking USDT balance for address: ${address}`);
    console.log(`Using contract address: ${USDT_CONTRACT_ADDRESS}`);
    console.log(`Using TRON network: ${process.env.TRON_FULL_HOST}\n`);
    
    // Create contract instance
    const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    
    // Call balanceOf function with explicit parameters
    const balance = await contract.balanceOf(address).call({
      _isConstant: true,
      from: address
    });
    
    const usdtBalance = fromAtomicUnits(balance.toString());
    console.log(`Raw balance: ${balance.toString()}`);
    console.log(`USDT balance: ${usdtBalance}\n`);
    
    return usdtBalance;
  } catch (error) {
    console.error('Error checking USDT balance:', error.message);
    throw error;
  }
}

/**
 * Get TRX balance
 */
async function getTrxBalance(address) {
  try {
    console.log(`Checking TRX balance for: ${address}`);
    const balance = await tronWeb.trx.getBalance(address);
    const balanceTrx = balance / 1000000; // Convert sun to TRX
    console.log(`TRX balance: ${balanceTrx} TRX\n`);
    return balanceTrx;
  } catch (error) {
    console.error('Error checking TRX balance:', error.message);
    return 0;
  }
}

/**
 * Get account details
 */
async function getAccountDetails(address) {
  try {
    console.log(`Getting account details for: ${address}`);
    
    // Get account info
    const account = await tronWeb.trx.getAccount(address);
    console.log('Account exists:', !!account.address);
    
    // Check TRX balance first
    await getTrxBalance(address);
    
    // Get transaction history
    console.log('\nChecking recent transactions...');
    const txs = await tronWeb.trx.getTransactionsRelated(address, 'to', 5);
    
    if (txs && txs.data && txs.data.length > 0) {
      console.log(`Found ${txs.data.length} transactions`);
      txs.data.forEach((tx, index) => {
        console.log(`\nTransaction ${index + 1}:`);
        console.log(`- Hash: ${tx.txID}`);
        console.log(`- Block: ${tx.blockNumber}`);
        console.log(`- Timestamp: ${new Date(tx.block_timestamp).toISOString()}`);
      });
    } else {
      console.log('No transactions found');
    }
    
    return account;
  } catch (error) {
    console.error('Error getting account details:', error.message);
    return null;
  }
}

/**
 * Check a specific payment in the database
 */
async function checkPayment(paymentId) {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log(`\n======= Checking Payment ${paymentId} =======\n`);
    
    // Get payment from database
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      console.log(`Payment not found: ${paymentId}`);
      return;
    }
    
    console.log('Payment details:');
    console.log(`- ID: ${payment.paymentId}`);
    console.log(`- Address: ${payment.address}`);
    console.log(`- Amount: ${payment.amount} USDT`);
    console.log(`- Status: ${payment.status}`);
    console.log(`- Created: ${payment.createdAt}`);
    
    // Get account details first
    await getAccountDetails(payment.address);
    
    try {
      // Check balance on blockchain
      const balance = await getUsdtBalance(payment.address);
      const isPaid = balance >= payment.amount;
      
      console.log('\nPayment verification:');
      console.log(`- Expected amount: ${payment.amount} USDT`);
      console.log(`- Current balance: ${balance} USDT`);
      console.log(`- Payment received: ${isPaid ? 'YES' : 'NO'}`);
      
      if (isPaid && payment.status === 'pending') {
        console.log('\n⚠️ ISSUE DETECTED: Payment received but status is still pending.');
        console.log('The payment was detected on the blockchain but not processed by the system.\n');
        
        // Offer to update the status
        console.log('\nTo manually update this payment status, run:');
        console.log(`
node -e "
const mongoose = require('mongoose');
const Payment = require('./src/models/payment.model');
require('dotenv').config();

async function updatePayment() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const payment = await Payment.findOne({ paymentId: '${paymentId}' });
    if (payment) {
      payment.status = 'completed';
      await payment.save();
      console.log('Payment status updated to completed');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

updatePayment();
"
        `);
      } else if (!isPaid) {
        console.log('\nPayment not yet received on the blockchain. Possible reasons:');
        console.log('1. Transaction is still pending on the TRON network');
        console.log('2. Transaction was sent to the wrong address');
        console.log('3. Transaction amount is less than expected');
        console.log('4. Using wrong contract address for the network (mainnet vs testnet)');
      } else {
        console.log(`\nPayment status is: ${payment.status}`);
      }
    } catch (error) {
      console.error('\nERROR: Unable to check USDT balance properly.');
      console.log('\nPossible fixes:');
      console.log('1. Make sure your TRON_FULL_HOST and USDT_CONTRACT_ADDRESS match the network you\'re using.');
      console.log('2. For Nile testnet, use USDT_CONTRACT_ADDRESS=TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf');
      console.log('3. For Shasta testnet, use USDT_CONTRACT_ADDRESS=TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj');
      
      console.log('\nThe system detected you\'re using:');
      console.log(`- Network: ${process.env.TRON_FULL_HOST}`);
      console.log(`- Contract: ${USDT_CONTRACT_ADDRESS}`);
      
      console.log('\nTo manually update this payment to completed, run:');
      console.log(`
node -e "
const mongoose = require('mongoose');
const Payment = require('./src/models/payment.model');
require('dotenv').config();

async function updatePayment() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const payment = await Payment.findOne({ paymentId: '${paymentId}' });
    if (payment) {
      payment.status = 'completed';
      await payment.save();
      console.log('Payment status updated to completed');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

updatePayment();
"
      `);
    }
    
  } catch (error) {
    console.error('Error checking payment:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
  }
}

// Allow running from command line with payment ID
if (require.main === module) {
  const paymentId = process.argv[2];
  
  if (!paymentId) {
    console.log('Please provide a payment ID');
    console.log('Usage: node check-payment.js paymentId');
    process.exit(1);
  }
  
  checkPayment(paymentId)
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { checkPayment, getUsdtBalance, getAccountDetails }; 