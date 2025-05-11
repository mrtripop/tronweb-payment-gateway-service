const TronWeb = require('tronweb');
const mongoose = require('mongoose');
const Payment = require('../src/models/payment.model');
require('dotenv').config();

/**
 * Monitor account activation and transfer funds when ready
 */
async function monitorAndTransfer() {
  try {
    // The specific payment ID
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
    
    console.log('Payment found:', payment.paymentId);
    console.log('Address:', payment.address);
    console.log('Amount:', payment.amount, 'USDT');
    
    if (!payment.privateKey) {
      console.error('❌ No private key available for this payment');
      process.exit(1);
    }
    
    // USDT contract address
    const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    
    // Initialize TronWeb with the main wallet's private key
    const mainTronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: process.env.TRON_PRIVATE_KEY
    });
    
    // Initialize TronWeb with the payment wallet's private key
    const paymentTronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: payment.privateKey
    });
    
    // Check and wait for account activation
    let accountActivated = false;
    let attemptCount = 0;
    const maxAttempts = 10;
    
    console.log('\nMonitoring account activation status...');
    
    while (!accountActivated && attemptCount < maxAttempts) {
      attemptCount++;
      console.log(`\nAttempt ${attemptCount}/${maxAttempts} to check account status...`);
      
      try {
        // Check if account exists
        const account = await mainTronWeb.trx.getAccount(payment.address);
        accountActivated = !!account.address;
        
        if (accountActivated) {
          console.log('✅ Account is now activated!');
          
          // Check TRX balance
          const trxBalance = await mainTronWeb.trx.getBalance(payment.address);
          const trxBalanceInTrx = trxBalance / 1000000;
          console.log('TRX Balance:', trxBalanceInTrx, 'TRX');
          
          // If TRX balance is too low, send more TRX for fees
          if (trxBalance < 10000) {
            console.log('TRX balance too low for fees, sending more...');
            const trxAmount = 5000000; // 5 TRX
            try {
              const trxTx = await mainTronWeb.trx.sendTransaction(payment.address, trxAmount.toString());
              console.log('Sent 5 TRX for fees. Transaction ID:', trxTx.txid);
              
              // Wait for TRX transaction to confirm
              console.log('Waiting for TRX transaction to confirm...');
              await new Promise(resolve => setTimeout(resolve, 10000));
            } catch (trxError) {
              console.error('Error sending TRX:', trxError.message);
            }
          }
          
          break;
        } else {
          console.log('Account still not activated');
          
          // Send TRX to try activating the account
          if (attemptCount % 2 === 0) {
            console.log('Sending 10 TRX to activate account...');
            try {
              const trxAmount = 10000000; // 10 TRX
              const trxTx = await mainTronWeb.trx.sendTransaction(payment.address, trxAmount.toString());
              console.log('TRX sent. Transaction ID:', trxTx.txid);
            } catch (trxError) {
              console.log('Error sending TRX:', trxError.message);
            }
          }
        }
      } catch (error) {
        console.log('Account not found on blockchain yet');
        
        // After a few attempts, try sending TRX to activate
        if (attemptCount === 3) {
          console.log('Trying to activate account by sending 10 TRX...');
          try {
            const trxAmount = 10000000; // 10 TRX
            const trxTx = await mainTronWeb.trx.sendTransaction(payment.address, trxAmount.toString());
            console.log('TRX sent. Transaction ID:', trxTx.txid);
          } catch (trxError) {
            console.log('Error sending TRX:', trxError.message);
          }
        }
      }
      
      // Wait before next attempt
      console.log(`Waiting 20 seconds before next check...`);
      await new Promise(resolve => setTimeout(resolve, 20000));
    }
    
    if (!accountActivated) {
      console.log('\n❌ Account could not be activated after multiple attempts.');
      console.log('Please use TronLink to manually transfer the funds as explained in the recovery instructions.');
      process.exit(1);
    }
    
    // Now that account is activated, try to transfer USDT
    console.log('\nAttempting to transfer USDT to main wallet...');
    
    try {
      // Connect to USDT contract using payment wallet credentials
      const usdtContract = await paymentTronWeb.contract().at(USDT_CONTRACT_ADDRESS);
      
      // Check USDT balance
      const balanceResult = await usdtContract.balanceOf(payment.address).call();
      const usdtBalance = parseFloat(balanceResult.toString()) / 1e6;
      console.log('USDT Balance:', usdtBalance, 'USDT');
      
      if (usdtBalance < payment.amount) {
        console.error(`❌ Insufficient USDT balance: ${usdtBalance} (expected ${payment.amount})`);
        process.exit(1);
      }
      
      // Get the decimal precision of USDT (usually 6)
      const decimals = await usdtContract.decimals().call();
      const decimalFactor = 10 ** decimals;
      
      // Calculate amount with proper decimal precision
      const amountToTransfer = Math.floor(payment.amount * decimalFactor);
      
      if (!process.env.MAIN_WALLET_ADDRESS) {
        console.error('❌ MAIN_WALLET_ADDRESS environment variable not set');
        process.exit(1);
      }
      
      console.log(`Transferring ${payment.amount} USDT to ${process.env.MAIN_WALLET_ADDRESS}...`);
      
      // Transfer USDT to main wallet
      const transferResult = await usdtContract.transfer(
        process.env.MAIN_WALLET_ADDRESS,
        amountToTransfer.toString()
      ).send();
      
      console.log('\n✅ TRANSFER SUCCESSFUL!');
      console.log('Transaction ID:', transferResult);
      console.log('View on TronScan: https://tronscan.org/#/transaction/' + transferResult);
      
      // Update payment status
      await Payment.updateOne(
        { paymentId },
        { 
          $set: { 
            status: 'completed', 
            transferTransactionId: transferResult,
            updatedAt: new Date()
          } 
        }
      );
      
      console.log('Payment record updated with transaction ID');
      
    } catch (transferError) {
      console.error('\n❌ TRANSFER FAILED:', transferError.message);
      console.log('Please use TronLink to manually transfer the funds as explained in the recovery instructions.');
    }
    
  } catch (error) {
    console.error('Script error:', error.message);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  }
}

// Run the function
monitorAndTransfer(); 