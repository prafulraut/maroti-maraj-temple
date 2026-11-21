const mongoose = require('mongoose');

// Stores global palkhi settings: the current image URL
const palkhiSettingsSchema = new mongoose.Schema({
  imageUrl: {
    type: String,
    default: '',
  },
  palkhiTitle: {
    type: String,
    default: 'Maroti Maharaj Palkhi 2024',
  },
  palkhiDate: {          // start date (Day 1), "YYYY-MM-DD"
    type: String,
    default: '',
  },
  totalDays: {           // e.g. 8 → Day 1 … Day 8
    type: Number,
    min: 1,
    default: 8,
  },
  startLocation: {
    type: String,
    default: '',
  },
  endLocation: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
}, { timestamps: true });

module.exports = mongoose.model('PalkhiSettings', palkhiSettingsSchema);
