const TronWeb = require('tronweb');
const qrcode = require('qrcode');
const Payment = require('../models/payment.model');
const { generateOrderId } = require('../utils/helpers');
const { logPaymentJourney, logError, PAYMENT_STAGES } = require('../utils/logger');

// Create TronWeb instance
const tronWeb = new TronWeb({
  fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY
});

// TRC20 USDT contract address on the TRON network
const USDT_CONTRACT_ADDRESS = process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// Get main wallet address from env
const MAIN_WALLET_ADDRESS = process.env.MAIN_WALLET_ADDRESS;

/**
 * Create a new payment request
 */
exports.createPayment = async (req, res) => {
  try {
    const { amount, customerEmail, description, callbackUrl, orderId } = req.body;
    
    // Log payment request
    logPaymentJourney('NEW_REQUEST', PAYMENT_STAGES.PAYMENT_REQUESTED, { 
      amount, 
      customerEmail, 
      description,
      orderId
    });
    
    if (!amount || amount <= 0) {
      logError('NEW_REQUEST', PAYMENT_STAGES.PAYMENT_REQUESTED, 'Invalid amount provided', { amount });
      return res.status(400).json({ 
        success: false, 
        message: 'Valid amount is required'
      });
    }

    if (!MAIN_WALLET_ADDRESS) {
      logError('NEW_REQUEST', PAYMENT_STAGES.PAYMENT_REQUESTED, 'Main wallet address not configured', {});
      return res.status(500).json({
        success: false,
        message: 'Payment system not properly configured'
      });
    }

    // Create payment record
    const paymentId = generateOrderId();
    
    // Create a memo that combines paymentId and amount to identify the payment
    const memo = `PAY-${paymentId}-${amount}`;
    
    const payment = new Payment({
      paymentId,
      orderId: orderId || `ORD-${Date.now()}`,
      amount,
      customerEmail,
      description,
      callbackUrl,
      address: MAIN_WALLET_ADDRESS,
      memo,
      status: 'pending',
      useMainWallet: true
    });

    await payment.save();
    
    // Log payment creation
    logPaymentJourney(paymentId, PAYMENT_STAGES.PAYMENT_CREATED, { 
      amount, 
      address: MAIN_WALLET_ADDRESS,
      memo,
      status: 'pending'
    });

    // Generate QR code with just the wallet address for better wallet compatibility
    // Advanced URI format not supported by all wallets
    console.log(`[DEBUG] Creating QR code for address: ${MAIN_WALLET_ADDRESS}`);
    const qrCodeUrl = await qrcode.toDataURL(MAIN_WALLET_ADDRESS);
    
    // Also log detailed payment info for debugging
    console.log(`[DEBUG] Payment created: ID=${paymentId}, Amount=${amount}, Memo=${memo}`);
    console.log(`[DEBUG] Full payment URI would be: tron:${MAIN_WALLET_ADDRESS}?token=${USDT_CONTRACT_ADDRESS}&amount=${amount}&memo=${encodeURIComponent(memo)}`);

    return res.status(201).json({
      success: true,
      data: {
        paymentId,
        address: MAIN_WALLET_ADDRESS,
        amount,
        memo,
        status: 'pending',
        qrCode: qrCodeUrl
      }
    });
  } catch (error) {
    logError('SYSTEM', PAYMENT_STAGES.ERROR, error, { context: 'createPayment' });
    console.error('Create payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating payment',
      error: error.message
    });
  }
};

/**
 * Check payment status
 */
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    logPaymentJourney(paymentId, 'STATUS_CHECK_REQUESTED', { source: 'API' });
    
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      logError(paymentId, 'STATUS_CHECK_FAILED', 'Payment not found');
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Log current status
    logPaymentJourney(paymentId, 'STATUS_CHECK_PERFORMED', { 
      status: payment.status,
      address: payment.address 
    });

    // Since we're using the main wallet, there's no transfer step
    const transferStatus = payment.useMainWallet ? 'not_needed' : (payment.transferTransactionId ? 'transferred' : 'pending_transfer');
    
    return res.status(200).json({
      success: true,
      data: {
        paymentId,
        status: payment.status,
        amount: payment.amount,
        address: payment.address,
        memo: payment.memo,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        transferStatus: transferStatus,
        transactionId: payment.transactionId || null,
        transferTransactionId: payment.transferTransactionId || null,
        fullPaymentComplete: (payment.status === 'completed')
      }
    });
  } catch (error) {
    logError(req.params.paymentId || 'UNKNOWN', PAYMENT_STAGES.ERROR, error, { 
      context: 'checkPaymentStatus' 
    });
    console.error('Check payment status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking payment status',
      error: error.message
    });
  }
};

/**
 * Get payment details
 */
exports.getPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;
    logPaymentJourney(paymentId, 'PAYMENT_DETAILS_REQUESTED', { source: 'API' });
    
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      logError(paymentId, 'PAYMENT_DETAILS_FAILED', 'Payment not found');
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    logPaymentJourney(paymentId, 'PAYMENT_DETAILS_PROVIDED', { status: payment.status });
    
    // Check if funds have been transferred to main wallet
    const transferStatus = payment.transferTransactionId ? 'transferred' : 'pending_transfer';
    const displayStatus = (payment.status === 'completed' && transferStatus === 'transferred') 
      ? 'fully_completed' 
      : payment.status;
    
    return res.status(200).json({
      success: true,
      data: {
        paymentId: payment.paymentId,
        amount: payment.amount,
        description: payment.description,
        address: payment.address,
        status: displayStatus,
        transferStatus: transferStatus,
        transactionId: payment.transactionId || null,
        transferTransactionId: payment.transferTransactionId || null,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt
      }
    });
  } catch (error) {
    logError(req.params.paymentId || 'UNKNOWN', PAYMENT_STAGES.ERROR, error, { 
      context: 'getPaymentDetails' 
    });
    console.error('Get payment details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting payment details',
      error: error.message
    });
  }
};

/**
 * Handle webhooks (for payment confirmations)
 */
exports.handleWebhook = async (req, res) => {
  try {
    // In a real implementation, this would verify the webhook signature
    // Process the webhook data from TronScan or your monitoring service
    const { paymentId, transactionId, status } = req.body;
    
    logPaymentJourney(paymentId || 'UNKNOWN', PAYMENT_STAGES.WEBHOOK_RECEIVED, { 
      transactionId, 
      status,
      body: req.body
    });
    
    if (!paymentId || !status) {
      logError('WEBHOOK', PAYMENT_STAGES.WEBHOOK_RECEIVED, 'Missing required fields', req.body);
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    const payment = await Payment.findOne({ paymentId });
    
    if (!payment) {
      logError(paymentId, PAYMENT_STAGES.WEBHOOK_RECEIVED, 'Payment not found');
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    // Log status change
    logPaymentJourney(paymentId, PAYMENT_STAGES.STATUS_CHANGED, {
      oldStatus: payment.status,
      newStatus: status,
      transactionId
    });
    
    // Update payment status
    payment.status = status;
    if (transactionId) {
      payment.transactionId = transactionId;
    }
    
    await payment.save();
    
    // If there's a callback URL, you would call it here
    if (payment.callbackUrl) {
      logPaymentJourney(paymentId, PAYMENT_STAGES.MERCHANT_CALLBACK_SENT, {
        callbackUrl: payment.callbackUrl
      });
      // Call the merchant's callback URL (implementation omitted)
    }
    
    logPaymentJourney(paymentId, PAYMENT_STAGES.WEBHOOK_PROCESSED, { status });
    
    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    const paymentId = req.body?.paymentId || 'UNKNOWN';
    logError(paymentId, PAYMENT_STAGES.ERROR, error, { 
      context: 'handleWebhook', 
      body: req.body 
    });
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing webhook',
      error: error.message
    });
  }
};

/**
 * Get all payments with optional filtering
 */
exports.getAllPayments = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build filter
    const filter = {};
    if (status) {
      filter.status = status;
    }
    
    logPaymentJourney('SYSTEM', 'PAYMENTS_LIST_REQUESTED', { 
      filter, 
      page, 
      limit 
    });
    
    // Count total payments matching filter
    const total = await Payment.countDocuments(filter);
    
    // Get paginated payments
    const payments = await Payment.find(filter)
      .select('-privateKey') // Exclude sensitive information
      .sort({ createdAt: -1 }) // Most recent first
      .skip(skip)
      .limit(parseInt(limit));
    
    // Map payments to include transfer status
    const mappedPayments = payments.map(payment => {
      const transferStatus = payment.transferTransactionId ? 'transferred' : 'pending_transfer';
      const fullPaymentComplete = (payment.status === 'completed' && transferStatus === 'transferred');
      
      return {
        paymentId: payment.paymentId,
        amount: payment.amount,
        description: payment.description,
        address: payment.address,
        status: payment.status,
        transferStatus: transferStatus,
        fullPaymentComplete: fullPaymentComplete,
        transferTransactionId: payment.transferTransactionId || null,
        transactionId: payment.transactionId || null,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt
      };
    });
    
    logPaymentJourney('SYSTEM', 'PAYMENTS_LIST_PROVIDED', { 
      count: payments.length,
      total,
      page
    });
    
    return res.status(200).json({
      success: true,
      data: {
        payments: mappedPayments,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logError('SYSTEM', PAYMENT_STAGES.ERROR, error, { 
      context: 'getAllPayments' 
    });
    console.error('Get all payments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving payments',
      error: error.message
    });
  }
}; 