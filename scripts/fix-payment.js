const mongoose = require('mongoose');
const TronWeb = require('tronweb');
const Payment = require('../src/models/payment.model');
const { activateAccount, delegateEnergy, accountExists } = require('../src/utils/resource-delegation');
require('dotenv').config();

/**
 * Fix a specific payment that shows on blockchain but not in system
 */
async function fixPayment() {
  try {
    // The specific payment ID with issues
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
    
    console.log('\n====== PAYMENT DETAILS ======');
    console.log('Payment ID:', payment.paymentId);
    console.log('Status:', payment.status);
    console.log('Address:', payment.address);
    console.log('Amount:', payment.amount, 'USDT');
    
    // Initialize TronWeb
    const tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: process.env.TRON_PRIVATE_KEY
    });
    
    // USDT contract address
    const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    
    // Step 1: Check USDT balance directly from blockchain
    console.log('\nChecking USDT balance on blockchain...');
    try {
      // Create contract instance
      const contract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
      
      // Check balance
      const balanceResult = await contract.balanceOf(payment.address).call({
        _isConstant: true,
        from: payment.address
      });
      
      const usdtBalance = parseFloat(balanceResult.toString()) / 1e6;
      console.log('USDT Balance on blockchain:', usdtBalance, 'USDT');
      console.log('Expected amount:', payment.amount, 'USDT');
      
      if (usdtBalance >= payment.amount) {
        console.log('✅ Funds verified on blockchain!');
        
        // Step 2: Activate account if needed and delegate energy for transaction
        console.log('\nActivating account and delegating energy...');
        
        try {
          // Check if account already exists
          let isAccountActive = await accountExists(payment.address);
          
          if (!isAccountActive) {
            const activationResult = await activateAccount(payment.address);
            console.log('Account activation:', activationResult.message || 'Already active');
            
            // Wait for account activation to propagate on the blockchain (10 seconds)
            console.log('Waiting for account activation to propagate...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Verify account is now active
            isAccountActive = await accountExists(payment.address);
            console.log('Account active after waiting:', isAccountActive);
            
            if (!isAccountActive) {
              console.log('Account still not active, waiting additional time...');
              await new Promise(resolve => setTimeout(resolve, 20000));
              isAccountActive = await accountExists(payment.address);
              console.log('Account active after additional wait:', isAccountActive);
            }
          } else {
            console.log('Account already active, no activation needed');
          }
          
          if (isAccountActive) {
            // Delegate energy
            const energyResult = await delegateEnergy(payment.address, 200000); // Extra energy for safety
            console.log('Energy delegation:', energyResult.message || 'Failed');
            
            // Wait for energy delegation to propagate
            console.log('Waiting for energy delegation to propagate...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Step 3: Attempt to transfer funds to main wallet
            if (payment.privateKey) {
              console.log('\nAttempting to transfer USDT to main wallet...');
              
              // Create TronWeb instance with payment address private key
              const tempTronWeb = new TronWeb({
                fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
                privateKey: payment.privateKey
              });
              
              // Connect to USDT contract
              const tempUsdtContract = await tempTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
              
              // Get the decimal precision of USDT (usually 6)
              const decimals = await tempUsdtContract.decimals().call();
              const decimalFactor = 10 ** decimals;
              
              // Calculate amount with proper decimal precision
              const amountToTransfer = Math.floor(payment.amount * decimalFactor);
              
              try {
                // Transfer USDT to main wallet
                const transferResult = await tempUsdtContract.transfer(
                  process.env.MAIN_WALLET_ADDRESS,
                  amountToTransfer.toString()
                ).send();
                
                console.log('✅ Transfer successful! Transaction ID:', transferResult);
                
                // Update payment status
                payment.status = 'completed';
                payment.transferTransactionId = transferResult;
                await payment.save();
                
                console.log('✅ Payment status updated to completed');
              } catch (transferError) {
                console.error('❌ Transfer failed:', transferError.message);
                
                // Check if "funds_received" status is a valid value in the schema
                try {
                  // Mark as funds_received
                  await Payment.updateOne(
                    { paymentId: payment.paymentId },
                    { $set: { status: 'funds_received' } }
                  );
                  console.log('Payment status updated to funds_received for manual processing');
                } catch (statusError) {
                  console.error('Error updating status:', statusError.message);
                  console.log('Unable to update payment status due to schema constraints');
                }
              }
            } else {
              console.log('❌ Cannot transfer funds: No private key available for this payment');
            }
          } else {
            console.error('❌ Account activation failed after multiple attempts');
          }
        } catch (resourceError) {
          console.error('Error with account activation or energy delegation:', resourceError.message);
        }
      } else {
        console.log('❌ Insufficient funds on blockchain');
      }
    } catch (error) {
      console.error('Error checking/processing payment:', error.message);
    }
    
  } catch (error) {
    console.error('Error fixing payment:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
fixPayment(); 