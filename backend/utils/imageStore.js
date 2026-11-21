const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const Image = require('../models/Image');

// Netlify Functions accept at most ~6 MB per request (≈4.5 MB of binary after
// base64 encoding), so keep each file comfortably below that.
// The admin pages compress photos in the browser before uploading.
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const URL_PREFIX = '/api/images/';
const IMAGE_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg',
  png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff', ico: 'image/x-icon',
};

/** Multer instance that keeps files in memory (no disk writes). */
function imageUpload(maxFiles = 1) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE, files: maxFiles },
    // Accept every image format. Browsers convert most photos to JPEG first;
    // some send no MIME type (e.g. HEIC), so fall back to the file extension.
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase().slice(1);
      if (!String(file.mimetype).startsWith('image/') && IMAGE_EXT[ext]) file.mimetype = IMAGE_EXT[ext];
      // SVG can contain scripts → never store it raw (the browser converts SVGs to JPEG first)
      if (String(file.mimetype).startsWith('image/') && !file.mimetype.includes('svg')) return cb(null, true);
      cb(new Error('Only image files are allowed'));
    },
  });
}

/** Save a multer memory file to MongoDB and return its public URL. */
async function saveImage(file) {
  const doc = await Image.create({
    data: file.buffer,
    contentType: file.mimetype,
    size: file.size,
    originalName: file.originalname,
  });
  return URL_PREFIX + doc._id;
}

/** Delete an image previously saved with saveImage (ignores other URLs). */
async function deleteImageByUrl(url) {
  if (!url || !url.startsWith(URL_PREFIX)) return;
  const id = url.slice(URL_PREFIX.length);
  if (mongoose.Types.ObjectId.isValid(id)) await Image.findByIdAndDelete(id);
}

module.exports = { imageUpload, saveImage, deleteImageByUrl, MAX_FILE_SIZE };
