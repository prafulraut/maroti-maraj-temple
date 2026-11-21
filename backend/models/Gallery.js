const mongoose = require('mongoose');

const GALLERY_CATEGORIES = ['Temple', 'Festival', 'Aarti', 'Palkhi', 'Devotees', 'Other'];
const MEDIA_TYPES = ['image', 'video'];
// 'pending'  → submitted by a visitor, waiting for admin approval (not public)
// 'approved' → visible on the public gallery
const GALLERY_STATUSES = ['pending', 'approved'];

const gallerySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      default: '',
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    category: {
      type: String,
      enum: GALLERY_CATEGORIES,
      default: 'Temple',
    },
    mediaType: {
      type: String,
      enum: MEDIA_TYPES,
      default: 'image',
    },
    // URL of the media file: /api/images/:id for photos, /api/videos/:id for videos.
    // (The field keeps its original name so older records keep working.)
    imageUrl: {
      type: String,
      required: [true, 'Media file is required'],
    },
    status: {
      type: String,
      enum: GALLERY_STATUSES,
      default: 'approved',
    },
    // Name a visitor typed when submitting without logging in (optional)
    uploaderName: {
      type: String,
      trim: true,
      default: '',
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Gallery', gallerySchema);
module.exports.GALLERY_CATEGORIES = GALLERY_CATEGORIES;
module.exports.MEDIA_TYPES = MEDIA_TYPES;
