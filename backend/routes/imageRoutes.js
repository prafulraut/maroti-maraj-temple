const express = require('express');
const mongoose = require('mongoose');
const Image = require('../models/Image');

const router = express.Router();

// GET /api/images/:id  — public: returns the raw image
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).end();
    const img = await Image.findById(req.params.id);
    if (!img) return res.status(404).end();

    res.set('Content-Type', img.contentType);
    // Image content never changes for a given id → let browsers/CDN cache it
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(img.data);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
