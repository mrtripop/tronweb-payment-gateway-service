const mongoose = require('mongoose');
const Payment = require('./src/models/payment.model');
require('dotenv').config();

async function updatePaymentField() {
  try {
    const paymentId = 'order_1746987441544_6049';
    const transactionId = 'pending-manual-transfer';
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find the payment
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      console.error(`Payment not found: ${paymentId}`);
      process.exit(1);
    }
    
    console.log('Before update:');
    console.log('- Payment ID:', payment.paymentId);
    console.log('- Status:', payment.status);
    console.log('- transferTransactionId:', payment.transferTransactionId || 'Not set');
    
    // Update directly with updateOne to ensure the field is added
    const result = await Payment.updateOne(
      { paymentId },
      { $set: { transferTransactionId: transactionId } }
    );
    
    console.log('\nUpdate result:', result);
    
    // Check if it worked
    const updatedPayment = await Payment.findOne({ paymentId });
    
    console.log('\nAfter update:');
    console.log('- Payment ID:', updatedPayment.paymentId);
    console.log('- Status:', updatedPayment.status);
    console.log('- transferTransactionId:', updatedPayment.transferTransactionId || 'Not set');
    
  } catch (error) {
    console.error('Error updating payment field:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
updatePaymentField(); 