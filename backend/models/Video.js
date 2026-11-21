const mongoose = require('mongoose');

// A video stored in MongoDB as a series of VideoChunk documents.
// Netlify Functions accept/return at most ~6 MB per request, so videos are
// uploaded and streamed in small chunks.
const videoSchema = new mongoose.Schema({
  contentType:  { type: String, required: true },
  size:         { type: Number, required: true },
  chunkSize:    { type: Number, required: true },
  chunkCount:   { type: Number, required: true },
  originalName: { type: String, default: '' },
  // Secret that lets the uploader send chunks without being logged in
  uploadToken:  { type: String, required: true, select: false },
  complete:     { type: Boolean, default: false },
  // Gallery details collected when the upload starts
  meta: {
    title:        { type: String, default: '' },
    description:  { type: String, default: '' },
    category:     { type: String, default: 'Other' },
    uploaderName: { type: String, default: '' },
    status:       { type: String, default: 'pending' },
    uploadedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
}, { timestamps: true });

module.exports = mongoose.model('Video', videoSchema);
