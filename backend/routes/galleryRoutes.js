const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/galleryController');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { CHUNK_SIZE } = require('../utils/videoStore');

// ─── Public ───────────────────────────────────────────────────────────────────
router.get('/', ctrl.getImages);                 // GET /api/gallery?category=Festival&type=image&limit=6

// ─── Uploads: admin only ─────────────────────────────────────────────────────
router.post('/', protect, adminOnly, ctrl.uploadMiddleware, ctrl.uploadImages);

router.post('/videos/start', protect, adminOnly, ctrl.startVideo);
// Chunks/finish are authorised by the secret upload token issued by /videos/start
router.put('/videos/:id/chunks/:n',
  express.raw({ type: 'application/octet-stream', limit: CHUNK_SIZE + 1024 }),
  ctrl.uploadVideoChunk);
router.post('/videos/:id/finish', ctrl.finishVideo);

// ─── Admin Only ───────────────────────────────────────────────────────────────
router.get('/manage',          protect, adminOnly, ctrl.getForAdmin);
router.patch('/:id/approve',   protect, adminOnly, ctrl.approveItem);
router.put('/:id',             protect, adminOnly, ctrl.updateImage);
router.delete('/:id',          protect, adminOnly, ctrl.deleteImage);

module.exports = router;
