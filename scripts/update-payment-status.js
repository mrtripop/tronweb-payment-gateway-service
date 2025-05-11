const mongoose = require('mongoose');
const Payment = require('../src/models/payment.model');
require('dotenv').config();

/**
 * Update a specific payment status directly in the database
 */
async function updatePaymentStatus() {
  try {
    // The specific payment ID to update
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
    
    console.log('\n====== PAYMENT DETAILS (BEFORE UPDATE) ======');
    console.log('Payment ID:', payment.paymentId);
    console.log('Status:', payment.status);
    console.log('Address:', payment.address);
    console.log('Amount:', payment.amount, 'USDT');
    
    // Update payment status manually
    try {
      // Set your manually obtained transaction ID if available
      const manualTransferId = process.env.MANUAL_TX_ID || 'manual_transfer';
      
      // Update the payment status
      await Payment.updateOne(
        { paymentId },
        { 
          $set: { 
            status: 'completed', 
            transferTransactionId: manualTransferId,
            updatedAt: new Date()
          } 
        }
      );
      
      console.log('\n✅ Payment status updated successfully!');
      console.log('New status: completed');
      console.log('Transfer Transaction ID:', manualTransferId);
      
      // Verify the update
      const updatedPayment = await Payment.findOne({ paymentId });
      
      console.log('\n====== PAYMENT DETAILS (AFTER UPDATE) ======');
      console.log('Payment ID:', updatedPayment.paymentId);
      console.log('Status:', updatedPayment.status);
      console.log('Address:', updatedPayment.address);
      console.log('Amount:', updatedPayment.amount, 'USDT');
      console.log('Transfer Transaction ID:', updatedPayment.transferTransactionId);
      
    } catch (updateError) {
      console.error('Error updating payment status:', updateError.message);
    }
    
  } catch (error) {
    console.error('Error updating payment:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
updatePaymentStatus(); 