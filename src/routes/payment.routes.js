const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

// Get all payments (transaction history)
router.get('/', paymentController.getAllPayments);

// Create a new payment request (generate USDT receiving address)
router.post('/create', paymentController.createPayment);

// Check payment status
router.get('/status/:paymentId', paymentController.checkPaymentStatus);

// Get payment details
router.get('/:paymentId', paymentController.getPaymentDetails);

// Webhook for payment confirmations (called by external service or cron job)
router.post('/webhook', paymentController.handleWebhook);

module.exports = router; 