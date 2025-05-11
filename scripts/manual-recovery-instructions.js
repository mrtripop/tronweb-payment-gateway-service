const mongoose = require('mongoose');
const Payment = require('../src/models/payment.model');
require('dotenv').config();

/**
 * Generate manual recovery instructions for a stuck payment
 */
async function generateRecoveryInstructions() {
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
    
    // Check if private key is available
    if (!payment.privateKey) {
      console.error('❌ No private key found for this payment. Cannot generate recovery instructions.');
      process.exit(1);
    }
    
    console.log('\n================================');
    console.log('MANUAL RECOVERY INSTRUCTIONS');
    console.log('================================');
    console.log('\nPayment Details:');
    console.log('- Payment ID:', payment.paymentId);
    console.log('- Amount:', payment.amount, 'USDT');
    console.log('- Address:', payment.address);
    
    console.log('\nPrivate Key (KEEP THIS SECURE):');
    console.log(payment.privateKey);
    
    console.log('\nFollow these steps to recover the funds:');
    console.log('1. Install TronLink wallet browser extension if you haven\'t already');
    console.log('2. In TronLink, click "Add Account" -> "Import Account" -> "Private Key"');
    console.log('3. Paste the private key shown above and create a name like "Recovery Wallet"');
    console.log('4. Once imported, you should see 20 USDT in this wallet');
    console.log('5. Send this USDT to your main wallet address:', process.env.MAIN_WALLET_ADDRESS || '[Set MAIN_WALLET_ADDRESS in .env]');
    console.log('6. After transfer, verify the transaction on Tronscan');
    console.log('7. Copy the transaction ID from TronScan and update the payment record');
    
    console.log('\nWhen the transfer is complete, run this command to update the payment status:');
    console.log('MANUAL_TX_ID=YOUR_TRANSACTION_ID node scripts/update-payment-status.js');
    
    console.log('\nIMPORTANT SECURITY NOTES:');
    console.log('- After recovery, remove this wallet from TronLink');
    console.log('- Consider this private key compromised after use');
    console.log('- Do not reuse this wallet for future payments');
    
  } catch (error) {
    console.error('Error generating recovery instructions:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
generateRecoveryInstructions(); 