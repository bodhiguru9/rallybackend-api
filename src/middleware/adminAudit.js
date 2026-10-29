const { getDB } = require('../config/database');

/**
 * adminAudit
 *
 * Writes one document per admin call to adminAuditLog — always on, no
 * enable flag. Must run after adminKeyAuth, so it only ever sees
 * authenticated requests (auth failures are logged by adminKeyAuth itself).
 *
 * Inserts a row before the handler runs, then updates it with the response
 * status/duration once the response is sent, so failed handlers are
 * captured too (res.on('finish') fires regardless of success/error).
 */

const summarizeBody = (body) => {
  if (!body || typeof body !== 'object') return null;
  // Keep IDs/counts/flags only — never full personal data (e.g. message bodies, bank details).
  const summary = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = typeof value === 'string' && value.length > 120 ? `${value.slice(0, 120)}…` : value;
    } else if (Array.isArray(value)) {
      summary[key] = `[${value.length} items]`;
    } else if (typeof value === 'object') {
      summary[key] = Object.keys(value);
    }
  }
  return summary;
};

const adminAudit = async (req, res, next) => {
  const db = getDB();
  const collection = db.collection('adminAuditLog');
  const startedAt = Date.now();

  let logId;
  try {
    const result = await collection.insertOne({
      at: new Date(),
      adminEmail: req.admin?.email || null,
      method: req.method,
      path: req.originalUrl,
      bodySummary: summarizeBody(req.body),
      ip: req.ip,
      status: null,
      durationMs: null,
    });
    logId = result.insertedId;
  } catch (error) {
    console.error('[adminAudit] Failed to write audit log entry:', error.message);
  }

  res.on('finish', async () => {
    if (!logId) return;
    try {
      await collection.updateOne(
        { _id: logId },
        { $set: { status: res.statusCode, durationMs: Date.now() - startedAt } }
      );
    } catch (error) {
      console.error('[adminAudit] Failed to update audit log entry:', error.message);
    }
  });

  next();
};

module.exports = adminAudit;
