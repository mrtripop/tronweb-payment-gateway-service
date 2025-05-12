const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  orderId: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  customerEmail: {
    type: String,
    required: false
  },
  description: {
    type: String,
    required: false
  },
  callbackUrl: {
    type: String,
    required: false
  },
  privateKey: {
    type: String,
    required: false
  },
  transactionId: {
    type: String,
    required: false
  },
  transferTransactionId: {
    type: String
  },
  memo: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['pending', 'funds_received', 'completed', 'failed'],
    default: 'pending'
  },
  accountActivated: {
    type: Boolean,
    default: false
  },
  activationTransactionId: {
    type: String
  },
  activationAttempts: {
    type: Number,
    default: 0
  },
  resourcesDelegated: {
    type: Boolean,
    default: false
  },
  useMainWallet: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update the updatedAt timestamp before saving
paymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Payment', paymentSchema); 