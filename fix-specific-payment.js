const mongoose = require('mongoose');
const Payment = require('./src/models/payment.model');
const { processSpecificPayment } = require('./src/utils/payment-processor');
require('dotenv').config();

/**
 * Fix and process a specific payment
 */
async function fixSpecificPayment() {
  try {
    // The specific payment ID that needs fixing
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
    
    console.log('\nPayment details:');
    console.log('- Payment ID:', payment.paymentId);
    console.log('- Status:', payment.status);
    console.log('- Address:', payment.address);
    console.log('- Amount:', payment.amount, 'USDT');
    console.log('- Transfer Transaction ID:', payment.transferTransactionId || 'Not set');
    
    // First check: if the status is wrong, fix it
    if (payment.status !== 'completed') {
      console.log('\nFIX: Payment status is not "completed". Updating status...');
      payment.status = 'completed';
      await payment.save();
      console.log('Payment status updated to "completed"');
    }
    
    // Second check: if transfer transaction ID exists but is invalid, clear it
    if (payment.transferTransactionId === 'null' || payment.transferTransactionId === '') {
      console.log('\nFIX: Transfer transaction ID exists but is invalid. Clearing it...');
      payment.transferTransactionId = null;
      await payment.save();
      console.log('Transfer transaction ID cleared');
    }
    
    console.log('\nAttempting to process the payment and complete the transfer...');
    
    // Process the payment - this checks funds and transfers to main wallet
    const result = await processSpecificPayment(paymentId);
    
    if (result) {
      console.log('\nSUCCESS: Payment processed successfully!');
      
      // Final verification
      const updatedPayment = await Payment.findOne({ paymentId });
      console.log('\nUpdated payment details:');
      console.log('- Payment ID:', updatedPayment.paymentId);
      console.log('- Status:', updatedPayment.status);
      console.log('- Address:', updatedPayment.address);
      console.log('- Amount:', updatedPayment.amount, 'USDT');
      console.log('- Transfer Transaction ID:', updatedPayment.transferTransactionId || 'Not set');
    } else {
      console.error('\nFAILURE: Could not process payment completely.');
      console.log('Please check logs for more details.');
    }
  } catch (error) {
    console.error('Error fixing payment:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
fixSpecificPayment(); 