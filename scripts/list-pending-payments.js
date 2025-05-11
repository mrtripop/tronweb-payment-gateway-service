require('dotenv').config();
const mongoose = require('mongoose');
const Payment = require('../src/models/payment.model');

/**
 * List all payments that need attention (not activated or funds not transferred)
 */
async function listPendingPayments() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');
    
    // Find payments that need activation
    const unactivatedPayments = await Payment.find({
      accountActivated: false
    }).sort({ createdAt: -1 });
    
    // Find payments with received funds but no transfer
    const pendingTransferPayments = await Payment.find({
      status: 'completed',
      transferTransactionId: { $exists: false }
    }).sort({ createdAt: -1 });
    
    // Find payments with received funds but no transfer
    const fundsReceivedPayments = await Payment.find({
      status: 'funds_received',
      transferTransactionId: { $exists: false }
    }).sort({ createdAt: -1 });
    
    console.log('='.repeat(80));
    console.log('PAYMENTS REQUIRING ATTENTION');
    console.log('='.repeat(80));
    
    // Display unactivated payments
    console.log('\n🔄 UNACTIVATED ACCOUNTS:', unactivatedPayments.length);
    console.log('='.repeat(80));
    
    if (unactivatedPayments.length > 0) {
      unactivatedPayments.forEach((payment, index) => {
        console.log(`${index + 1}. Payment ID: ${payment.paymentId}`);
        console.log(`   Address: ${payment.address}`);
        console.log(`   Amount: ${payment.amount} USDT`);
        console.log(`   Created: ${payment.createdAt}`);
        console.log(`   Status: ${payment.status}`);
        console.log(`   Activation Attempts: ${payment.activationAttempts}`);
        console.log(`   Recovery Command: node scripts/activate-and-recover-funds.js ${payment.paymentId}`);
        console.log('-'.repeat(80));
      });
    } else {
      console.log('No unactivated accounts found.');
    }
    
    // Display pending transfer payments (completed status)
    console.log('\n💰 COMPLETED PAYMENTS PENDING TRANSFER:', pendingTransferPayments.length);
    console.log('='.repeat(80));
    
    if (pendingTransferPayments.length > 0) {
      pendingTransferPayments.forEach((payment, index) => {
        console.log(`${index + 1}. Payment ID: ${payment.paymentId}`);
        console.log(`   Address: ${payment.address}`);
        console.log(`   Amount: ${payment.amount} USDT`);
        console.log(`   Created: ${payment.createdAt}`);
        console.log(`   Transaction ID: ${payment.transactionId || 'N/A'}`);
        console.log(`   Recovery Command: node scripts/activate-and-recover-funds.js ${payment.paymentId}`);
        console.log('-'.repeat(80));
      });
    } else {
      console.log('No completed payments pending transfer found.');
    }
    
    // Display funds received but not completed
    console.log('\n💸 FUNDS RECEIVED BUT NOT COMPLETED:', fundsReceivedPayments.length);
    console.log('='.repeat(80));
    
    if (fundsReceivedPayments.length > 0) {
      fundsReceivedPayments.forEach((payment, index) => {
        console.log(`${index + 1}. Payment ID: ${payment.paymentId}`);
        console.log(`   Address: ${payment.address}`);
        console.log(`   Amount: ${payment.amount} USDT`);
        console.log(`   Created: ${payment.createdAt}`);
        console.log(`   Account Activated: ${payment.accountActivated ? 'Yes' : 'No'}`);
        console.log(`   Transaction ID: ${payment.transactionId || 'N/A'}`);
        console.log(`   Recovery Command: node scripts/activate-and-recover-funds.js ${payment.paymentId}`);
        console.log('-'.repeat(80));
      });
    } else {
      console.log('No payments with funds received status found.');
    }
    
  } catch (error) {
    console.error('Error listing pending payments:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
}

// Execute the function
listPendingPayments().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 