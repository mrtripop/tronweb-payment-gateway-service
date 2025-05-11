const mongoose = require('mongoose');
const Payment = require('./src/models/payment.model');
require('dotenv').config();

async function updateTransferRecord() {
  try {
    const paymentId = 'order_1746989255500_9503';
    const transactionId = '31d1b5948cb7dd5c3b291dca0a223a2efe07a5e8214363c693e68f61d6cc241e';
    
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
    console.log(`Current status: ${payment.status}`);
    console.log(`Current transfer transaction ID: ${payment.transferTransactionId || 'None'}`);
    
    // Update the payment record
    payment.transferTransactionId = transactionId;
    await payment.save();
    
    console.log(`\nPayment record updated!`);
    console.log(`Transfer transaction ID set to: ${transactionId}`);
    
    // Get TronScan link
    const baseUrl = process.env.TRON_FULL_HOST.includes('nile') 
      ? 'https://nile.tronscan.org' 
      : 'https://tronscan.org';
    
    console.log(`\nYou can view this transaction on TronScan:`);
    console.log(`${baseUrl}/#/transaction/${transactionId}`);
    
  } catch (error) {
    console.error('Error updating transfer record:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
updateTransferRecord(); 