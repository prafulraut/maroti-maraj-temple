// Minimal in-memory rate limiter (no extra dependency).
// Note: on Netlify each function instance keeps its own counters, so this is a
// speed bump against spam rather than a hard guarantee.
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();   // ip → { count, resetAt }

  return (req, res, next) => {
    // Admins are never limited
    if (req.user && req.user.role === 'admin') return next();

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-nf-client-connection-ip']
      || req.ip
      || 'unknown';
    const now = Date.now();

    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count++;

    // keep the map small
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    if (entry.count > max) {
      return res.status(429).json({ success: false, message });
    }
    next();
  };
}

module.exports = rateLimit;
