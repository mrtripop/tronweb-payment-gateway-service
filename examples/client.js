const axios = require('axios');

// Base URL of your payment gateway
const API_URL = 'http://localhost:3000/api';

/**
 * Create a new payment request
 * @param {number} amount - Amount in USDT
 * @param {string} description - Payment description
 * @returns {Promise<Object>} Payment data
 */
async function createPayment(amount, description) {
  try {
    const response = await axios.post(`${API_URL}/payment/create`, {
      amount,
      description,
      customerEmail: 'customer@example.com',
      callbackUrl: 'https://yourwebsite.com/payment-webhook'
    });
    
    return response.data;
  } catch (error) {
    console.error('Error creating payment:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Check payment status
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object>} Payment status data
 */
async function checkPaymentStatus(paymentId) {
  try {
    const response = await axios.get(`${API_URL}/payment/status/${paymentId}`);
    
    return response.data;
  } catch (error) {
    console.error('Error checking payment status:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get payment details
 * @param {string} paymentId - Payment ID
 * @returns {Promise<Object>} Payment details
 */
async function getPaymentDetails(paymentId) {
  try {
    const response = await axios.get(`${API_URL}/payment/${paymentId}`);
    
    return response.data;
  } catch (error) {
    console.error('Error getting payment details:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Demo usage of the payment gateway
 */
async function demo() {
  try {
    // Create a new payment
    console.log('Creating a new payment...');
    const payment = await createPayment(10.5, 'Demo payment');
    
    console.log('Payment created:');
    console.log(JSON.stringify(payment, null, 2));
    
    // Get the payment ID
    const paymentId = payment.data.paymentId;
    
    // Check payment status (initially it should be pending)
    console.log('\nChecking payment status...');
    const status = await checkPaymentStatus(paymentId);
    
    console.log('Payment status:');
    console.log(JSON.stringify(status, null, 2));
    
    console.log('\nTo complete this payment, send 10.5 USDT to the following address:');
    console.log(`Address: ${payment.data.address}`);
    console.log('Then check the status again to see if it has been confirmed.');
  } catch (error) {
    console.error('Demo failed:', error);
  }
}

// Run the demo
demo(); 