const mongoose = require('mongoose');

const palkhiScheduleSchema = new mongoose.Schema({
  familyName: {
    type: String,
    required: [true, 'Family name is required'],
    trim: true,
  },
  mobileNumber: {
    type: String,
    required: [true, 'Mobile number is required'],
    trim: true,
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
  },
  address: {
    type: String,
    trim: true,
    default: '',
  },
  arrivalTime: {
    type: String,   // e.g. "10:30 AM"
    required: [true, 'Expected arrival time is required'],
  },
  timeTaken: {
    type: String,   // e.g. "45 minutes"
    required: [true, 'Time taken is required'],
  },
  // Which day of the Palkhi this stop belongs to (1 … totalDays)
  dayNumber: {
    type: Number,
    min: 1,
    default: 1,
  },
  // 'visit' = normal home visit, 'lunch' / 'dinner' = meal host (highlighted)
  visitType: {
    type: String,
    enum: ['visit', 'lunch', 'dinner'],
    default: 'visit',
  },
  // Sequence of the stop within its day
  orderIndex: {
    type: Number,
    default: 0,
  },
  smsSent: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['pending', 'in-transit', 'arrived', 'completed'],
    default: 'pending',
  },
}, { timestamps: true });

module.exports = mongoose.model('PalkhiSchedule', palkhiScheduleSchema);
