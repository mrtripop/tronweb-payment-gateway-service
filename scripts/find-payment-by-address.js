require('dotenv').config();
const mongoose = require('mongoose');
const Payment = require('../src/models/payment.model');

/**
 * Find payment details by TRON address
 * @param {string} address - TRON wallet address to search for
 */
async function findPaymentByAddress(address) {
  console.log(`Searching for payment with address: ${address}`);
  
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');
    
    // Find payment by address
    const payment = await Payment.findOne({ address });
    
    if (!payment) {
      console.error(`❌ No payment found with address: ${address}`);
      return;
    }
    
    console.log('='.repeat(80));
    console.log('PAYMENT DETAILS:');
    console.log('='.repeat(80));
    console.log(`Payment ID: ${payment.paymentId}`);
    console.log(`Order ID: ${payment.orderId}`);
    console.log(`TRON Address: ${payment.address}`);
    console.log(`Amount: ${payment.amount} USDT`);
    console.log(`Status: ${payment.status}`);
    console.log(`Created At: ${payment.createdAt}`);
    console.log(`Account Activated: ${payment.accountActivated ? 'Yes' : 'No'}`);
    console.log(`Activation Attempts: ${payment.activationAttempts}`);
    console.log(`Transaction ID: ${payment.transactionId || 'N/A'}`);
    console.log(`Transfer Transaction ID: ${payment.transferTransactionId || 'N/A'}`);
    console.log('='.repeat(80));
    console.log(`To recover funds, run: node scripts/activate-and-recover-funds.js ${payment.paymentId}`);
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('Error finding payment:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

// Check for command line arguments
if (process.argv.length < 3) {
  console.error('Usage: node find-payment-by-address.js <tron_address>');
  process.exit(1);
}

const address = process.argv[2];
findPaymentByAddress(address).then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 