const mongoose = require('mongoose');
const TronWeb = require('tronweb');
const Payment = require('./src/models/payment.model');
const { getUsdtBalance } = require('./src/utils/tron.service');
require('dotenv').config();

/**
 * Detailed diagnostic check for a specific payment
 */
async function diagnosePaymentIssue() {
  try {
    // The specific payment ID to diagnose
    const paymentId = 'order_1746992719676_7788';
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find the payment
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      console.error(`Payment not found: ${paymentId}`);
      process.exit(1);
    }
    
    console.log('\n====== PAYMENT DATABASE RECORD ======');
    console.log('- Payment ID:', payment.paymentId);
    console.log('- Status:', payment.status);
    console.log('- Address:', payment.address);
    console.log('- Amount:', payment.amount, 'USDT');
    console.log('- Transfer Transaction ID:', payment.transferTransactionId || 'Not set');
    console.log('- Created:', payment.createdAt);
    console.log('- Last Updated:', payment.updatedAt);
    
    // Create TronWeb instance
    const tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: process.env.TRON_PRIVATE_KEY
    });
    
    // USDT contract address
    const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    
    console.log('\n====== BLOCKCHAIN CHECKS ======');
    
    // Check if account exists on blockchain
    console.log('\nChecking if account exists on blockchain...');
    try {
      const account = await tronWeb.trx.getAccount(payment.address);
      const accountExists = !!account.address;
      console.log('Account exists on blockchain:', accountExists);
      
      if (!accountExists) {
        console.log('⚠️ ISSUE DETECTED: Account does not exist on the blockchain. This would prevent USDT transfers.');
      }
    } catch (error) {
      console.log('⚠️ ISSUE DETECTED: Error checking account existence:', error.message);
    }
    
    // Check TRX balance
    console.log('\nChecking TRX balance...');
    try {
      const trxBalance = await tronWeb.trx.getBalance(payment.address);
      const trxBalanceInTrx = trxBalance / 1000000;
      console.log('TRX Balance:', trxBalanceInTrx, 'TRX');
      
      if (trxBalance < 1000000) { // Less than 1 TRX
        console.log('⚠️ ISSUE DETECTED: Very low TRX balance. This could prevent USDT transfers.');
      }
    } catch (error) {
      console.log('Error checking TRX balance:', error.message);
    }
    
    // Check USDT balance directly from blockchain
    console.log('\nChecking USDT balance from blockchain...');
    try {
      // Create contract instance
      const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
      
      // Using call with parameters to avoid owner_address error
      const balanceResult = await contract.balanceOf(payment.address).call({
        _isConstant: true,
        from: payment.address
      });
      
      const usdtBalance = parseFloat(balanceResult.toString()) / 1e6;
      console.log('USDT Balance on blockchain:', usdtBalance, 'USDT');
      console.log('Expected amount:', payment.amount, 'USDT');
      
      if (usdtBalance >= payment.amount) {
        console.log('✅ FUNDS VERIFIED: Blockchain shows sufficient USDT funds!');
        console.log('⚠️ ISSUE DETECTED: System not recognizing confirmed payment on blockchain');
      } else if (usdtBalance > 0 && usdtBalance < payment.amount) {
        console.log('⚠️ ISSUE DETECTED: Partial payment received. Expected', payment.amount, 'but found', usdtBalance);
      } else {
        console.log('❌ FUNDS NOT FOUND: No USDT found at this address on the blockchain');
      }
    } catch (error) {
      console.log('Error checking USDT balance:', error.message);
    }
    
    // Check TronWeb configuration
    console.log('\n====== SYSTEM CONFIGURATION ======');
    console.log('- TRON Network:', process.env.TRON_FULL_HOST || 'Default (https://api.trongrid.io)');
    console.log('- USDT Contract:', USDT_CONTRACT_ADDRESS);
    
    // Check if private key is set
    if (!process.env.TRON_PRIVATE_KEY) {
      console.log('⚠️ ISSUE DETECTED: TRON_PRIVATE_KEY environment variable not set');
    } else {
      console.log('- TRON_PRIVATE_KEY is set');
    }
    
    // Check if main wallet address is set
    if (!process.env.MAIN_WALLET_ADDRESS) {
      console.log('⚠️ ISSUE DETECTED: MAIN_WALLET_ADDRESS environment variable not set');
    } else {
      console.log('- MAIN_WALLET_ADDRESS is set');
    }
    
    console.log('\n====== POTENTIAL ROOT CAUSES ======');
    console.log('1. API rate limiting: TronGrid may be limiting your API calls');
    console.log('2. Network congestion: The TRON network might be experiencing delays');
    console.log('3. Contract mismatch: The USDT contract address might be incorrect');
    console.log('4. Balance check logic issue: The system might not be correctly detecting balance');
    console.log('5. Missing account activation: The address might not be activated on TRON network');
    console.log('6. Transaction might be too recent: Needs more confirmations');
    
    console.log('\n====== RECOMMENDED ACTIONS ======');
    console.log('1. Manual update: Use update-transfer-id.js to update this payment status');
    console.log('2. Fix balance check code: Verify tron.service.js is correctly checking balances');
    console.log('3. Add account activation: Ensure accounts are activated before checking balance');
    console.log('4. Increase confirmation timeout: Allow more time for transactions to confirm');
    
  } catch (error) {
    console.error('Error diagnosing payment issue:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
diagnosePaymentIssue(); 