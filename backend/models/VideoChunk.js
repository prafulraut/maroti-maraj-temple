const mongoose = require('mongoose');

// One piece of a Video's bytes (see models/Video.js)
const videoChunkSchema = new mongoose.Schema({
  video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true },
  n:     { type: Number, required: true },   // chunk index, starting at 0
  data:  { type: Buffer, required: true },
});

videoChunkSchema.index({ video: 1, n: 1 }, { unique: true });

module.exports = mongoose.model('VideoChunk', videoChunkSchema);
