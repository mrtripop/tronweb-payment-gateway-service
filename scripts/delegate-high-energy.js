const { delegateEnergy } = require('../src/utils/resource-delegation');
require('dotenv').config();

/**
 * Delegate a high amount of energy to a specific payment address
 */
async function delegateHighEnergy() {
  try {
    // The specific payment address with issues
    const paymentAddress = 'TGw6i5SDys1y1BCopctkqX7UQWoieMXXzx';
    
    // Delegate a large amount of energy (500K) to ensure transfer works
    console.log(`Delegating 500,000 energy to ${paymentAddress}...`);
    const energyResult = await delegateEnergy(paymentAddress, 500000);
    
    if (energyResult.success) {
      console.log('✅ Energy delegation successful!');
      console.log('Transaction ID:', energyResult.txid);
      console.log('Message:', energyResult.message);
    } else {
      console.error('❌ Energy delegation failed:', energyResult.error);
    }
    
  } catch (error) {
    console.error('Script error:', error.message);
  }
}

// Run the function
delegateHighEnergy(); 