const TronWeb = require('tronweb');
require('dotenv').config();

/**
 * Activate a TRON account using multiple methods
 */
async function activateAccount() {
  try {
    // The specific payment address to activate
    const address = 'TGw6i5SDys1y1BCopctkqX7UQWoieMXXzx';
    
    // Initialize TronWeb with the main wallet's private key
    const tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: process.env.TRON_PRIVATE_KEY
    });
    
    // Check if account already exists
    console.log(`Checking if account ${address} exists...`);
    try {
      const account = await tronWeb.trx.getAccount(address);
      const exists = !!account.address;
      console.log('Account exists:', exists);
      
      if (exists) {
        console.log('✅ Account is already activated!');
        return;
      }
    } catch (error) {
      console.log('Account does not exist yet on the blockchain');
    }
    
    // Method 1: Direct TRX transfer (highest TRX amount - 10 TRX)
    console.log('\nMethod 1: Sending larger amount of TRX to activate account...');
    try {
      const trxAmount = 10000000; // 10 TRX in SUN units
      const transaction = await tronWeb.trx.sendTransaction(
        address,
        trxAmount.toString()
      );
      
      console.log('✅ TRX transfer successful!');
      console.log('Transaction ID:', transaction.txid);
      console.log('View on TronScan: https://tronscan.org/#/transaction/' + transaction.txid);
    } catch (error) {
      console.error('❌ TRX transfer failed:', error.message);
    }
    
    // Wait for transaction to confirm
    console.log('\nWaiting for transaction to confirm...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check if account exists after Method 1
    try {
      const account = await tronWeb.trx.getAccount(address);
      const exists = !!account.address;
      console.log('Account exists after Method 1:', exists);
      
      if (exists) {
        console.log('✅ Account activation successful!');
        return;
      }
    } catch (error) {
      console.log('Account still not activated after Method 1');
    }
    
    // Method 2: Create account using createAccount API
    console.log('\nMethod 2: Using createAccount API...');
    try {
      const createResult = await tronWeb.transactionBuilder.createAccount(
        address,
        tronWeb.defaultAddress.hex
      );
      
      const signedTx = await tronWeb.trx.sign(createResult);
      const receipt = await tronWeb.trx.sendRawTransaction(signedTx);
      
      console.log('✅ Account creation successful!');
      console.log('Transaction ID:', receipt.txid);
      console.log('View on TronScan: https://tronscan.org/#/transaction/' + receipt.txid);
    } catch (error) {
      console.error('❌ Account creation failed:', error.message);
    }
    
    // Wait for transaction to confirm
    console.log('\nWaiting for transaction to confirm...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Final check if account exists
    try {
      const account = await tronWeb.trx.getAccount(address);
      const exists = !!account.address;
      console.log('Account exists after all methods:', exists);
      
      if (exists) {
        console.log('✅ Account is now activated!');
      } else {
        console.log('❌ Account activation failed after multiple attempts.');
        console.log('Please check TronScan for the transactions and try again later.');
      }
    } catch (error) {
      console.log('Account still not activated after all methods');
    }
    
  } catch (error) {
    console.error('Script error:', error.message);
  }
}

// Run the function
activateAccount(); 