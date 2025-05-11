const mongoose = require('mongoose');
const TronWeb = require('tronweb');
const Payment = require('../src/models/payment.model');
const { activateWallet } = require('../src/services/activation-service');
require('dotenv').config();

/**
 * Bulk activate wallets for pending payments
 */
async function bulkActivateWallets() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find payments that need activation (pending status)
    const pendingPayments = await Payment.find({ 
      status: 'pending'
    }).sort({ createdAt: -1 }).limit(50);  // Process most recent 50 payments
    
    console.log(`Found ${pendingPayments.length} pending payments to activate`);
    
    if (pendingPayments.length === 0) {
      console.log('No pending payments need activation');
      return;
    }
    
    // Initialize TronWeb
    const tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: process.env.TRON_PRIVATE_KEY
    });
    
    // Track activation statistics
    let activationStats = {
      total: pendingPayments.length,
      successful: 0,
      failed: 0,
      alreadyActive: 0
    };
    
    // Process each payment
    for (const payment of pendingPayments) {
      console.log(`\nProcessing payment ${payment.paymentId} for address ${payment.address}`);
      
      // Check if account already exists
      let isActivated = false;
      
      try {
        const account = await tronWeb.trx.getAccount(payment.address);
        isActivated = !!account.address;
      } catch (error) {
        isActivated = false;
      }
      
      if (isActivated) {
        console.log(`✅ Account ${payment.address} is already activated`);
        activationStats.alreadyActive++;
        continue;
      }
      
      // Try to activate with higher TRX amount (10 TRX)
      console.log(`Attempting to activate account ${payment.address}...`);
      const activationResult = await activateWallet(payment.address, 10000000);  // 10 TRX
      
      if (activationResult) {
        console.log(`✅ Successfully activated account ${payment.address}`);
        activationStats.successful++;
        
        // Update payment to mark activation success
        await Payment.updateOne(
          { paymentId: payment.paymentId },
          { $set: { accountActivated: true } }
        );
      } else {
        console.log(`❌ Failed to activate account ${payment.address}`);
        activationStats.failed++;
      }
      
      // Wait a bit between activations to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Print activation statistics
    console.log('\n====== ACTIVATION STATISTICS ======');
    console.log(`Total processed: ${activationStats.total}`);
    console.log(`Already active: ${activationStats.alreadyActive}`);
    console.log(`Successfully activated: ${activationStats.successful}`);
    console.log(`Failed to activate: ${activationStats.failed}`);
    
  } catch (error) {
    console.error('Error activating wallets:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
bulkActivateWallets(); 