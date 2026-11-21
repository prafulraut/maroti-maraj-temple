// Express app shared by:
//   - server.js           → local development (node server.js)
//   - netlify-handler.js  → production on Netlify Functions
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// ─── Netlify path fix ─────────────────────────────────────────────────────────
// Requests may arrive as /.netlify/functions/api/api/... → strip the prefix
app.use((req, res, next) => {
  const prefix = '/.netlify/functions/api';
  if (req.url.startsWith(prefix)) req.url = req.url.slice(prefix.length) || '/';
  next();
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allowed: localhost (dev), *.netlify.app, and any domain listed in
// ALLOWED_ORIGINS (comma-separated, e.g. a custom domain).
const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https:\/\/[a-z0-9-]+(--[a-z0-9-]+)?\.netlify\.app$/.test(origin) ||
      extraOrigins.includes(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Upload-Token', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ─── Legacy local uploads (only used before images moved to MongoDB) ─────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/authRoutes'));    // Auth: register, login
app.use('/api/admin',     require('./routes/adminRoutes'));   // Admin: user management
app.use('/api/events',    require('./routes/eventRoutes'));
app.use('/api/donations', require('./routes/donationRoutes'));
app.use('/api/contacts',  require('./routes/contactRoutes'));
app.use('/api/palkhi',    require('./routes/palkhiRoutes'));
app.use('/api/gallery',   require('./routes/galleryRoutes'));  // Photo gallery
app.use('/api/images',    require('./routes/imageRoutes'));    // Images stored in MongoDB
app.use('/api/videos',    require('./routes/videoRoutes'));    // Videos stored in MongoDB (chunked)

// ─── Health Check ─────────────────────────────────────────────────────────────
const health = (req, res) => {
  res.json({
    success: true,
    message: '🛕 Maroti Maharaj Temple API is running!',
    version: '1.0.0',
    endpoints: {
      auth:      '/api/auth',
      admin:     '/api/admin',
      events:    '/api/events',
      donations: '/api/donations',
      contacts:  '/api/contacts',
      palkhi:    '/api/palkhi',
      gallery:   '/api/gallery',
      images:    '/api/images/:id',
      videos:    '/api/videos/:id',
    },
  });
};
app.get('/', health);
app.get('/api', health);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

module.exports = app;
