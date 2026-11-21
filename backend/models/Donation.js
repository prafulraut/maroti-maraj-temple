const mongoose = require('mongoose');
const Counter = require('./Counter');

const PURPOSES = ['General', 'Temple Maintenance', 'Festival', 'Palkhi', 'Food Distribution', 'Education', 'Other'];
const PAYMENT_MODES = ['Cash', 'UPI', 'Online', 'Cheque', 'Bank Transfer', 'Other'];
const STATUSES = ['Pending', 'Completed', 'Failed'];

const donationSchema = new mongoose.Schema(
  {
    receiptNo: {
      type: String,
      unique: true,
      sparse: true,
    },
    name: {
      type: String,
      required: [true, 'Donor name is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    amount: {
      type: Number,
      required: [true, 'Donation amount is required'],
      min: [1, 'Amount must be at least 1'],
    },
    purpose: {
      type: String,
      enum: PURPOSES,
      default: 'General',
    },
    message: {
      type: String,
      default: '',
    },
    paymentMode: {
      type: String,
      enum: PAYMENT_MODES,
      default: 'Cash',
    },
    transactionId: {          // UPI ref / cheque no. / bank ref
      type: String,
      trim: true,
      default: '',
    },
    paymentStatus: {
      type: String,
      enum: STATUSES,
      default: 'Completed',
    },
    // Date the donation was actually given (admin can back-date offline entries)
    donationDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Palkhi: which day (1 … totalDays) and optionally which family stop
    palkhiDay: {
      type: Number,
      min: 1,
      default: null,
      index: true,
    },
    palkhiStop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PalkhiSchedule',
      default: null,
    },
    isAnonymous: {            // hide donor name on public listings / receipts
      type: Boolean,
      default: false,
    },
    source: {                 // 'online' = submitted by devotee, 'offline' = entered by admin
      type: String,
      enum: ['online', 'offline'],
      default: 'online',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Auto-generate a receipt number like MMT-2026-00042
donationSchema.pre('save', async function () {
  if (this.receiptNo) return;
  const year = new Date(this.donationDate || Date.now()).getFullYear();
  const seq = await Counter.next(`donation-${year}`);
  this.receiptNo = `MMT-${year}-${String(seq).padStart(5, '0')}`;
});

const Donation = mongoose.model('Donation', donationSchema);
Donation.PURPOSES = PURPOSES;
Donation.PAYMENT_MODES = PAYMENT_MODES;
Donation.STATUSES = STATUSES;

module.exports = Donation;
