const crypto = require('crypto');
const mongoose = require('mongoose');
const Video = require('../models/Video');
const VideoChunk = require('../models/VideoChunk');

// Netlify Functions accept/return at most ~6 MB per request (≈4.5 MB of binary
// after base64 encoding), so videos move in 3 MB pieces both ways.
const CHUNK_SIZE = 3 * 1024 * 1024;
const MAX_RESPONSE_BYTES = CHUNK_SIZE;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const URL_PREFIX = '/api/videos/';
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

const isId = (id) => mongoose.Types.ObjectId.isValid(id);

/** Expected byte length of chunk n for a video of the given size. */
function chunkLength(video, n) {
  return n < video.chunkCount - 1 ? video.chunkSize : video.size - video.chunkSize * (video.chunkCount - 1);
}

/** Start an upload. Returns { video, uploadToken }. Throws Error with .status on bad input. */
async function startVideoUpload({ size, contentType, originalName, meta }) {
  size = Number(size);
  if (!/^video\/[\w.+-]+$/.test(String(contentType || ''))) {
    throw Object.assign(new Error('Only video files are allowed.'), { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw Object.assign(new Error('Invalid video size.'), { status: 400 });
  }
  if (size > MAX_VIDEO_SIZE) {
    throw Object.assign(new Error(`Videos must be ${MAX_VIDEO_SIZE / 1024 / 1024} MB or smaller.`), { status: 400 });
  }

  cleanupStaleUploads().catch((e) => console.error('Video cleanup failed:', e.message));

  const uploadToken = crypto.randomBytes(24).toString('hex');
  const video = await Video.create({
    contentType,
    size,
    chunkSize: CHUNK_SIZE,
    chunkCount: Math.ceil(size / CHUNK_SIZE),
    originalName: String(originalName || '').slice(0, 200),
    uploadToken,
    meta,
  });
  return { video, uploadToken };
}

/** Load an unfinished upload after checking its token. */
async function findOpenUpload(id, token) {
  if (!isId(id) || !token) return null;
  const video = await Video.findById(id).select('+uploadToken');
  if (!video || video.complete || video.uploadToken !== token) return null;
  return video;
}

/** Store one chunk (idempotent, so the browser can safely retry). */
async function saveChunk(video, n, data) {
  if (!Number.isInteger(n) || n < 0 || n >= video.chunkCount) {
    throw Object.assign(new Error('Invalid chunk number.'), { status: 400 });
  }
  if (!Buffer.isBuffer(data) || data.length !== chunkLength(video, n)) {
    throw Object.assign(new Error('Chunk size does not match.'), { status: 400 });
  }
  await VideoChunk.updateOne(
    { video: video._id, n },
    { $set: { data } },
    { upsert: true }
  );
}

/** Mark an upload finished once every chunk has arrived. */
async function finishVideoUpload(video) {
  const received = await VideoChunk.countDocuments({ video: video._id });
  if (received !== video.chunkCount) {
    throw Object.assign(new Error(`Upload incomplete (${received}/${video.chunkCount} parts received).`), { status: 400 });
  }
  video.complete = true;
  await video.save();
  return URL_PREFIX + video._id;
}

/** GET /api/videos/:id — streams a video, honouring HTTP Range requests. */
async function streamVideo(req, res) {
  try {
    if (!isId(req.params.id)) return res.status(404).end();
    const video = await Video.findById(req.params.id);
    if (!video || !video.complete) return res.status(404).end();

    const size = video.size;
    let start = 0;
    let end = size - 1;
    const range = req.headers.range;

    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!m || (m[1] === '' && m[2] === '')) {
        return res.status(416).set('Content-Range', `bytes */${size}`).end();
      }
      if (m[1] === '') {
        start = Math.max(0, size - parseInt(m[2], 10));   // "bytes=-500" → last 500 bytes
      } else {
        start = parseInt(m[1], 10);
        if (m[2] !== '') end = Math.min(parseInt(m[2], 10), size - 1);
      }
      if (start >= size || start > end) {
        return res.status(416).set('Content-Range', `bytes */${size}`).end();
      }
    }

    // Never send more than one piece per response (hosting response limit).
    // Browsers simply ask for the next range.
    end = Math.min(end, start + MAX_RESPONSE_BYTES - 1);

    const first = Math.floor(start / video.chunkSize);
    const last = Math.floor(end / video.chunkSize);
    const chunks = await VideoChunk.find({ video: video._id, n: { $gte: first, $lte: last } }).sort({ n: 1 });
    if (chunks.length !== last - first + 1) return res.status(500).json({ success: false, message: 'Video data is incomplete.' });

    const joined = Buffer.concat(chunks.map((c) => c.data));
    const offset = start - first * video.chunkSize;
    const body = joined.subarray(offset, offset + (end - start + 1));
    const partial = Boolean(range) || end < size - 1;

    res.status(partial ? 206 : 200);
    res.set({
      'Content-Type': video.contentType,
      'Content-Length': String(body.length),
      'Accept-Ranges': 'bytes',
      // Only the browser may cache. Netlify's CDN caches by URL and ignores the
      // Range header, so it would hand the first piece back for every later
      // range request and the video would never play.
      'Cache-Control': 'private, max-age=86400',
      'Netlify-CDN-Cache-Control': 'no-store',
      'Vary': 'Range',
    });
    if (partial) res.set('Content-Range', `bytes ${start}-${end}/${size}`);
    res.end(body);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/** Delete a video previously saved here (ignores other URLs). */
async function deleteVideoByUrl(url) {
  if (!url || !url.startsWith(URL_PREFIX)) return;
  const id = url.slice(URL_PREFIX.length);
  if (!isId(id)) return;
  await VideoChunk.deleteMany({ video: id });
  await Video.findByIdAndDelete(id);
}

/** Remove uploads that were started but never finished. */
async function cleanupStaleUploads() {
  const stale = await Video.find({
    complete: false,
    createdAt: { $lt: new Date(Date.now() - STALE_UPLOAD_MS) },
  }).select('_id');
  if (!stale.length) return;
  const ids = stale.map((v) => v._id);
  await VideoChunk.deleteMany({ video: { $in: ids } });
  await Video.deleteMany({ _id: { $in: ids } });
}

module.exports = {
  CHUNK_SIZE,
  MAX_VIDEO_SIZE,
  ALLOWED_VIDEO_TYPES,
  startVideoUpload,
  findOpenUpload,
  saveChunk,
  finishVideoUpload,
  streamVideo,
  deleteVideoByUrl,
};
