const mongoose = require('mongoose');
const Payment = require('./src/models/payment.model');
require('dotenv').config();

async function updatePaymentStatus() {
  try {
    const paymentId = 'order_1746990863357_6784';
    
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
    console.log('- Address:', payment.address);
    console.log('- Amount:', payment.amount, 'USDT');
    console.log('- Transfer Transaction ID:', payment.transferTransactionId || 'Not set');
    
    // Update the payment status to 'pending' to match the blockchain state
    const result = await Payment.updateOne(
      { paymentId },
      { 
        $set: { 
          status: 'pending',
          // Remove any transfer transaction ID if it exists
          transferTransactionId: null
        } 
      }
    );
    
    console.log('\nUpdate result:', result);
    
    // Check if it worked
    const updatedPayment = await Payment.findOne({ paymentId });
    
    console.log('\nAfter update:');
    console.log('- Payment ID:', updatedPayment.paymentId);
    console.log('- Status:', updatedPayment.status);
    console.log('- Transfer Transaction ID:', updatedPayment.transferTransactionId || 'Not set');
    
    console.log('\nPayment status has been corrected to match the blockchain state (pending).');
    console.log('The frontend should now show the correct status when refreshed.');
    
  } catch (error) {
    console.error('Error updating payment status:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
updatePaymentStatus(); 