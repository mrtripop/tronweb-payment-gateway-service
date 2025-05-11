const mongoose = require('mongoose');
const { delegateEnergy, delegateBandwidth, activateAccount, getAccountResources } = require('../src/utils/resource-delegation');
const Payment = require('../src/models/payment.model');
require('dotenv').config();

/**
 * Delegate resources to pending payment addresses
 */
async function delegateResourcesToPendingPayments() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find all pending payments
    const pendingPayments = await Payment.find({ status: 'pending' });
    console.log(`Found ${pendingPayments.length} pending payments`);
    
    if (pendingPayments.length === 0) {
      console.log('No pending payments found');
      return;
    }
    
    // Process each payment
    for (const payment of pendingPayments) {
      console.log(`\nProcessing payment ${payment.paymentId} to address ${payment.address}`);
      
      // Step 1: Check if account needs activation
      console.log('Checking account activation...');
      const activationResult = await activateAccount(payment.address);
      console.log(activationResult.message || 'Account already active');
      
      // Step 2: Check current resources
      console.log('Checking current account resources...');
      const resourcesCheck = await getAccountResources(payment.address);
      
      if (resourcesCheck.success) {
        console.log(`Current bandwidth: ${resourcesCheck.bandwidth}`);
        console.log(`Current energy: ${resourcesCheck.energy}`);
      } else {
        console.log('Could not check resources:', resourcesCheck.error);
      }
      
      // Step 3: Delegate energy
      console.log('Delegating energy...');
      const energyAmount = 100000; // Adjust as needed
      const energyResult = await delegateEnergy(payment.address, energyAmount);
      
      if (energyResult.success) {
        console.log(`Successfully delegated ${energyAmount} energy. Transaction ID: ${energyResult.txid}`);
      } else {
        console.log('Energy delegation failed:', energyResult.error);
      }
      
      // Step 4: Delegate bandwidth
      console.log('Delegating bandwidth...');
      const bandwidthAmount = 1000; // Adjust as needed
      const bandwidthResult = await delegateBandwidth(payment.address, bandwidthAmount);
      
      if (bandwidthResult.success) {
        console.log(`Successfully delegated ${bandwidthAmount} bandwidth. Transaction ID: ${bandwidthResult.txid}`);
      } else {
        console.log('Bandwidth delegation failed:', bandwidthResult.error);
      }
      
      // Step 5: Verify resources after delegation
      console.log('Checking updated account resources...');
      const updatedResources = await getAccountResources(payment.address);
      
      if (updatedResources.success) {
        console.log(`Updated bandwidth: ${updatedResources.bandwidth}`);
        console.log(`Updated energy: ${updatedResources.energy}`);
      } else {
        console.log('Could not check updated resources:', updatedResources.error);
      }
    }
    
  } catch (error) {
    console.error('Error delegating resources:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the function
delegateResourcesToPendingPayments().catch(console.error); 