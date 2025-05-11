const mongoose = require('mongoose');
const Payment = require('./src/models/payment.model');
require('dotenv').config();

/**
 * Update the transferTransactionId for a specific payment
 */
async function updateTransferTransactionId() {
  try {
    // The specific payment ID to update
    const paymentId = 'order_1746990863357_6784';
    
    // Mock transaction ID - typically this would be a real transaction hash from the blockchain
    // For a real production scenario, this should be a valid transaction hash
    const mockTransactionId = 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find the payment first to verify it exists
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      console.error(`Payment not found: ${paymentId}`);
      process.exit(1);
    }
    
    console.log('\nPayment before update:');
    console.log('- Payment ID:', payment.paymentId);
    console.log('- Status:', payment.status);
    console.log('- Address:', payment.address);
    console.log('- Amount:', payment.amount, 'USDT');
    console.log('- Transfer Transaction ID:', payment.transferTransactionId || 'Not set');
    
    // Make sure the status is 'completed'
    if (payment.status !== 'completed') {
      console.log('\nUpdating status to "completed"...');
      payment.status = 'completed';
    }
    
    // Set the transfer transaction ID
    console.log('\nUpdating transfer transaction ID...');
    payment.transferTransactionId = mockTransactionId;
    
    // Save the updated payment
    await payment.save();
    
    // Verify the update
    const updatedPayment = await Payment.findOne({ paymentId });
    
    console.log('\nPayment after update:');
    console.log('- Payment ID:', updatedPayment.paymentId);
    console.log('- Status:', updatedPayment.status);
    console.log('- Address:', updatedPayment.address);
    console.log('- Amount:', updatedPayment.amount, 'USDT');
    console.log('- Transfer Transaction ID:', updatedPayment.transferTransactionId);
    
    console.log('\nDatabase update successful!');
    
  } catch (error) {
    console.error('Error updating transfer transaction ID:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
updateTransferTransactionId(); 