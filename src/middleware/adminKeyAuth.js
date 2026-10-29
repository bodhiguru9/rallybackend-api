const crypto = require('crypto');
const { getDB } = require('../config/database');

/**
 * adminKeyAuth
 *
 * Authenticates calls to /api/admin/* from the Lovable admin panel's Supabase
 * Edge Functions. The panel itself never sees the key — it holds a Lovable
 * login session; the Edge Function forwards X-Admin-Key (shared secret) and
 * X-Admin-Email (the admin's email, as determined by Lovable's own login).
 *
 * Fails closed: if ADMIN_API_KEY isn't configured, or either header is
 * missing, or the key doesn't match, the request is rejected before it
 * reaches adminAudit or any handler. Because adminAudit runs after this
 * middleware, a rejected request would never be logged otherwise — so this
 * middleware logs its own rejections directly to adminAuditLog.
 */

const logRejection = async (req, status, reason) => {
  try {
    const db = getDB();
    await db.collection('adminAuditLog').insertOne({
      at: new Date(),
      adminEmail: typeof req.headers['x-admin-email'] === 'string' ? req.headers['x-admin-email'] : null,
      method: req.method,
      path: req.originalUrl,
      status,
      ip: req.ip,
      authFailure: true,
      reason,
    });
  } catch (error) {
    console.error('[adminKeyAuth] Failed to log rejected admin request:', error.message);
  }
};

const adminKeyAuth = async (req, res, next) => {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey) {
    await logRejection(req, 500, 'ADMIN_API_KEY not configured');
    return res.status(500).json({ success: false, error: 'Admin API is not configured' });
  }

  const providedKey = req.headers['x-admin-key'];
  const adminEmail = req.headers['x-admin-email'];

  if (typeof providedKey !== 'string' || !providedKey) {
    await logRejection(req, 401, 'Missing X-Admin-Key header');
    return res.status(401).json({ success: false, error: 'Missing X-Admin-Key header' });
  }

  if (typeof adminEmail !== 'string' || !adminEmail.trim()) {
    await logRejection(req, 401, 'Missing X-Admin-Email header');
    return res.status(401).json({ success: false, error: 'Missing X-Admin-Email header' });
  }

  const providedBuf = Buffer.from(providedKey);
  const configuredBuf = Buffer.from(configuredKey);

  // timingSafeEqual throws on a length mismatch rather than returning false,
  // so the lengths must be checked first.
  const keysMatch =
    providedBuf.length === configuredBuf.length &&
    crypto.timingSafeEqual(providedBuf, configuredBuf);

  if (!keysMatch) {
    await logRejection(req, 403, 'Admin key mismatch');
    return res.status(403).json({ success: false, error: 'Invalid admin key' });
  }

  req.admin = { email: adminEmail.trim() };
  next();
};

module.exports = adminKeyAuth;
