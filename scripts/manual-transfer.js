const mongoose = require('mongoose');
const TronWeb = require('tronweb');
const Payment = require('../src/models/payment.model');
require('dotenv').config();

/**
 * Manually transfer funds from payment address to main wallet
 */
async function manualTransfer() {
  try {
    // The specific payment ID
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
    
    console.log('\n====== PAYMENT DETAILS ======');
    console.log('Payment ID:', payment.paymentId);
    console.log('Status:', payment.status);
    console.log('Address:', payment.address);
    console.log('Amount:', payment.amount, 'USDT');
    
    // USDT contract address
    const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    
    // Initialize TronWeb with the payment's private key (if available)
    if (!payment.privateKey) {
      console.error('❌ No private key available for this payment in the database');
      console.log('Please provide the private key as an environment variable: PAYMENT_PRIVATE_KEY');
      
      if (!process.env.PAYMENT_PRIVATE_KEY) {
        console.error('PAYMENT_PRIVATE_KEY environment variable not set');
        process.exit(1);
      }
      
      console.log('Using PAYMENT_PRIVATE_KEY from environment variable');
    }
    
    const privateKey = payment.privateKey || process.env.PAYMENT_PRIVATE_KEY;
    
    try {
      console.log(`\nAttempting to transfer ${payment.amount} USDT from ${payment.address} to main wallet...`);
      
      // Create TronWeb instance with payment address private key
      const tronWeb = new TronWeb({
        fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
        privateKey: privateKey
      });
      
      // Check TRX balance for fees
      const trxBalance = await tronWeb.trx.getBalance(payment.address);
      const trxBalanceInTrx = trxBalance / 1000000;
      console.log('TRX Balance (for fees):', trxBalanceInTrx, 'TRX');
      
      if (trxBalance < 10000) { // Less than 0.01 TRX
        console.log('⚠️ Very low TRX balance for fees. Sending some TRX from main wallet...');
        
        // Create another TronWeb instance with main wallet private key
        const mainTronWeb = new TronWeb({
          fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
          privateKey: process.env.TRON_PRIVATE_KEY
        });
        
        // Send 1 TRX to cover fees
        const trxAmount = 1000000; // 1 TRX in SUN units
        await mainTronWeb.trx.sendTransaction(payment.address, trxAmount.toString());
        console.log(`Sent 1 TRX to ${payment.address} for fees`);
        
        // Wait for transaction to confirm
        console.log('Waiting for TRX transaction to confirm...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Connect to USDT contract
      const usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
      
      // Check USDT balance
      const balanceResult = await usdtContract.balanceOf(payment.address).call();
      const usdtBalance = parseFloat(balanceResult.toString()) / 1e6;
      console.log('USDT Balance confirmed on blockchain:', usdtBalance, 'USDT');
      
      if (usdtBalance < payment.amount) {
        console.error(`❌ Insufficient USDT balance: ${usdtBalance} (expected ${payment.amount})`);
        process.exit(1);
      }
      
      // Get the decimal precision of USDT (usually 6)
      const decimals = await usdtContract.decimals().call();
      const decimalFactor = 10 ** decimals;
      
      // Calculate amount with proper decimal precision
      const amountToTransfer = Math.floor(payment.amount * decimalFactor);
      
      if (!process.env.MAIN_WALLET_ADDRESS) {
        console.error('❌ MAIN_WALLET_ADDRESS environment variable not set');
        process.exit(1);
      }
      
      console.log(`Transferring ${payment.amount} USDT to ${process.env.MAIN_WALLET_ADDRESS}...`);
      
      // Transfer USDT to main wallet
      const transferResult = await usdtContract.transfer(
        process.env.MAIN_WALLET_ADDRESS,
        amountToTransfer.toString()
      ).send();
      
      console.log('\n✅ TRANSFER SUCCESSFUL!');
      console.log('Transaction ID:', transferResult);
      console.log('View on TronScan: https://tronscan.org/#/transaction/' + transferResult);
      
      // Update payment status if needed
      if (payment.status !== 'completed') {
        await Payment.updateOne(
          { paymentId },
          { 
            $set: { 
              status: 'completed', 
              transferTransactionId: transferResult,
              updatedAt: new Date()
            } 
          }
        );
        console.log('Payment status updated to completed with actual transaction ID');
      } else if (payment.transferTransactionId === 'manual_transfer') {
        // Update the generic transaction ID with the actual one
        await Payment.updateOne(
          { paymentId },
          { 
            $set: { 
              transferTransactionId: transferResult,
              updatedAt: new Date()
            } 
          }
        );
        console.log('Payment record updated with actual transaction ID');
      }
      
    } catch (transferError) {
      console.error('\n❌ TRANSFER FAILED:', transferError.message);
      
      if (transferError.message.includes('balance')) {
        console.log('\nPossible reasons:');
        console.log('1. Insufficient TRX for transaction fees');
        console.log('2. Account not activated properly on the blockchain');
      } else if (transferError.message.includes('energy') || transferError.message.includes('resource')) {
        console.log('\nPossible reason: Not enough energy or bandwidth for transaction');
        console.log('Try staking more TRX in your main wallet and delegating resources to this address');
      }
    }
    
  } catch (error) {
    console.error('Script error:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
manualTransfer(); 