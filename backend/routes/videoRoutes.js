const express = require('express');
const { streamVideo } = require('../utils/videoStore');

const router = express.Router();

// GET /api/videos/:id  — public: streams the video (supports Range requests)
router.get('/:id', streamVideo);

module.exports = router;
