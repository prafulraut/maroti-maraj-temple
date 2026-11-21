const mongoose = require('mongoose');

// Raw image bytes stored in MongoDB (Netlify Functions have no persistent disk).
// Served publicly by GET /api/images/:id
const imageSchema = new mongoose.Schema({
  data:        { type: Buffer, required: true },
  contentType: { type: String, required: true },
  size:        { type: Number, default: 0 },
  originalName:{ type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Image', imageSchema);
