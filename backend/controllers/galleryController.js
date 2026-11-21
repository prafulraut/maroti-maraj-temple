const Gallery = require('../models/Gallery');
const { GALLERY_CATEGORIES } = require('../models/Gallery');
const { imageUpload, saveImage, deleteImageByUrl } = require('../utils/imageStore');
const videoStore = require('../utils/videoStore');

// ─── Multer Config (in memory → stored in MongoDB) ───────────────────────────
// The pages upload one photo per request (Netlify request size limit),
// but several are still accepted for local use.
const MAX_FILES = 20;
const upload = imageUpload(MAX_FILES);

// Wrap multer so its errors come back as clean 400 JSON responses
exports.uploadMiddleware = (req, res, next) => {
  upload.array('images', MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    let message = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') message = 'Each image must be 4 MB or smaller.';
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = `You can upload at most ${MAX_FILES} images at once.`;
    }
    return res.status(400).json({ success: false, message });
  });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const isAdmin = (req) => Boolean(req.user && req.user.role === 'admin');

/** Validate and normalise the text fields sent with any upload. */
function readDetails(body) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const uploaderName = String(body.uploaderName || '').trim();
  const category = body.category || 'Other';

  if (!GALLERY_CATEGORIES.includes(category)) return { error: 'Invalid category.' };
  if (title.length > 120) return { error: 'Title cannot exceed 120 characters.' };
  if (description.length > 500) return { error: 'Description cannot exceed 500 characters.' };
  if (uploaderName.length > 60) return { error: 'Name cannot exceed 60 characters.' };
  return { title, description, category, uploaderName };
}

const sendError = (res, error) =>
  res.status(error.status || 500).json({ success: false, message: error.message });

// ─── Public listing ──────────────────────────────────────────────────────────

// GET /api/gallery?category=Festival&type=image&limit=6  — public, approved items only
exports.getImages = async (req, res) => {
  try {
    // Older records have no status field → treat them as approved
    const filter = { status: { $ne: 'pending' } };
    if (req.query.category && GALLERY_CATEGORIES.includes(req.query.category)) {
      filter.category = req.query.category;
    }
    if (req.query.type === 'video') filter.mediaType = 'video';
    if (req.query.type === 'image') filter.mediaType = { $ne: 'video' };

    let query = Gallery.find(filter).sort({ createdAt: -1 });
    const limit = parseInt(req.query.limit, 10);
    if (limit > 0) query = query.limit(limit);

    const images = await query;
    res.status(200).json({
      success: true,
      count: images.length,
      categories: GALLERY_CATEGORIES,
      data: images,
    });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/gallery/manage?status=pending&category=Temple  — admin, includes pending items
exports.getForAdmin = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status === 'pending') filter.status = 'pending';
    if (req.query.status === 'approved') filter.status = { $ne: 'pending' };
    if (req.query.category && GALLERY_CATEGORIES.includes(req.query.category)) {
      filter.category = req.query.category;
    }
    const items = await Gallery.find(filter).sort({ createdAt: -1 });
    const pendingCount = await Gallery.countDocuments({ status: 'pending' });
    res.status(200).json({ success: true, count: items.length, pendingCount, data: items });
  } catch (error) {
    sendError(res, error);
  }
};

// ─── Photo upload ────────────────────────────────────────────────────────────

// POST /api/gallery  — anyone (multipart: images[], title, description, category, uploaderName)
// Admin uploads are published immediately; visitor uploads wait for approval.
exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least one image.' });
    }

    const details = readDetails(req.body);
    if (details.error) return res.status(400).json({ success: false, message: details.error });

    const admin = isAdmin(req);
    const savedUrls = [];
    try {
      for (const file of req.files) savedUrls.push(await saveImage(file));

      const docs = savedUrls.map((imageUrl) => ({
        title: details.title,
        description: details.description,
        category: details.category,
        uploaderName: admin ? '' : details.uploaderName,
        mediaType: 'image',
        imageUrl,
        status: admin ? 'approved' : 'pending',
        uploadedBy: req.user ? req.user._id : undefined,
      }));

      const images = await Gallery.insertMany(docs);
      res.status(201).json({
        success: true,
        message: admin
          ? `${images.length} image(s) uploaded successfully.`
          : 'Thank you! Your photo will appear in the gallery after the temple reviews it.',
        data: admin ? images : images.map((i) => ({ _id: i._id, status: i.status })),
      });
    } catch (err) {
      // roll back image bytes that were already stored
      await Promise.all(savedUrls.map((u) => deleteImageByUrl(u).catch(() => {})));
      throw err;
    }
  } catch (error) {
    sendError(res, error);
  }
};

// ─── Video upload (chunked) ──────────────────────────────────────────────────

// POST /api/gallery/videos/start  — anyone
// JSON: { size, contentType, fileName, title, description, category, uploaderName }
exports.startVideo = async (req, res) => {
  try {
    const details = readDetails(req.body);
    if (details.error) return res.status(400).json({ success: false, message: details.error });

    const admin = isAdmin(req);
    const { video, uploadToken } = await videoStore.startVideoUpload({
      size: req.body.size,
      contentType: req.body.contentType,
      originalName: req.body.fileName,
      meta: {
        title: details.title,
        description: details.description,
        category: details.category,
        uploaderName: admin ? '' : details.uploaderName,
        status: admin ? 'approved' : 'pending',
        uploadedBy: req.user ? req.user._id : undefined,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        videoId: video._id,
        uploadToken,
        chunkSize: video.chunkSize,
        chunkCount: video.chunkCount,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
};

// PUT /api/gallery/videos/:id/chunks/:n  — raw bytes, header X-Upload-Token
exports.uploadVideoChunk = async (req, res) => {
  try {
    const video = await videoStore.findOpenUpload(req.params.id, req.get('X-Upload-Token'));
    if (!video) return res.status(404).json({ success: false, message: 'Upload not found or already finished.' });

    await videoStore.saveChunk(video, Number(req.params.n), req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/gallery/videos/:id/finish  — header X-Upload-Token
exports.finishVideo = async (req, res) => {
  try {
    const video = await videoStore.findOpenUpload(req.params.id, req.get('X-Upload-Token'));
    if (!video) return res.status(404).json({ success: false, message: 'Upload not found or already finished.' });

    const url = await videoStore.finishVideoUpload(video);
    const item = await Gallery.create({
      title: video.meta.title,
      description: video.meta.description,
      category: video.meta.category,
      uploaderName: video.meta.uploaderName,
      mediaType: 'video',
      imageUrl: url,
      status: video.meta.status,
      uploadedBy: video.meta.uploadedBy,
    });

    const approved = item.status === 'approved';
    res.status(201).json({
      success: true,
      message: approved
        ? 'Video uploaded successfully.'
        : 'Thank you! Your video will appear in the gallery after the temple reviews it.',
      data: approved ? item : { _id: item._id, status: item.status },
    });
  } catch (error) {
    sendError(res, error);
  }
};

// ─── Admin management ────────────────────────────────────────────────────────

// PATCH /api/gallery/:id/approve  — admin
exports.approveItem = async (req, res) => {
  try {
    const item = await Gallery.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
    res.status(200).json({ success: true, message: 'Approved and published.', data: item });
  } catch (error) {
    sendError(res, error);
  }
};

// PUT /api/gallery/:id  — admin (JSON: title, description, category)
exports.updateImage = async (req, res) => {
  try {
    const updates = {};
    ['title', 'description', 'category'].forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });

    const image = await Gallery.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!image) {
      return res.status(404).json({ success: false, message: 'Item not found.' });
    }
    res.status(200).json({ success: true, data: image });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// DELETE /api/gallery/:id  — admin (also used to reject a pending submission)
exports.deleteImage = async (req, res) => {
  try {
    const item = await Gallery.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found.' });
    }
    await deleteImageByUrl(item.imageUrl);
    await videoStore.deleteVideoByUrl(item.imageUrl);
    res.status(200).json({ success: true, message: 'Deleted successfully.' });
  } catch (error) {
    sendError(res, error);
  }
};
