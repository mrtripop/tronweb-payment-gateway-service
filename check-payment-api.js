const fetch = require('node-fetch');
require('dotenv').config();

/**
 * Check payment status via the API
 */
async function checkPaymentAPI() {
  // The specific payment ID to check
  const paymentId = 'order_1746990863357_6784';
  
  // API base URL
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000/api';
  
  try {
    console.log(`Checking payment status for ${paymentId} via API...`);
    
    // Make API request to check payment status
    const response = await fetch(`${apiBaseUrl}/payment/status/${paymentId}`);
    const data = await response.json();
    
    console.log('\nAPI Response:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.success) {
      const payment = data.data;
      
      console.log('\nPayment Status Summary:');
      console.log('- Payment ID:', payment.paymentId);
      console.log('- Status:', payment.status);
      console.log('- Transfer Status:', payment.transferStatus);
      console.log('- Transfer Transaction ID:', payment.transferTransactionId);
      console.log('- Full Payment Complete:', payment.fullPaymentComplete);
      
      // Check if payment is fully complete
      if (payment.fullPaymentComplete) {
        console.log('\n✅ Payment is fully complete! Both payment and transfer are successful.');
      } else if (payment.status === 'completed' && payment.transferStatus === 'transferred') {
        console.log('\n✅ Payment is fully complete! Both payment and transfer are successful.');
      } else if (payment.status === 'completed' && payment.transferStatus !== 'transferred') {
        console.log('\n⚠️ Payment has been received but funds have not been transferred to main wallet.');
      } else {
        console.log('\n❌ Payment is not complete.');
      }
    } else {
      console.error('\nError from API:', data.message);
    }
  } catch (error) {
    console.error('Error checking payment via API:', error.message);
    console.log('\nMake sure the payment gateway API server is running on http://localhost:3000');
  }
}

// Run the function
checkPaymentAPI(); 