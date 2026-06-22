const fs = require('fs/promises');
const path = require('path');

/**
 * Delete a local file WITHOUT blocking the event loop.
 *
 * Best practice (vs the old `fs.existsSync` + `fs.unlinkSync`):
 *  - Async (`fs.promises.unlink`) so the single Node thread keeps serving other
 *    requests instead of freezing while the OS deletes the file.
 *  - No `existsSync` pre-check — that's a TOCTOU race; we just attempt the delete
 *    and treat "file not found" (ENOENT) as success (nothing to delete).
 *  - Never throws: file cleanup is best-effort and must not fail the request.
 *
 * @param {string} filePath absolute path to the file
 * @returns {Promise<boolean>} true if a file was actually deleted
 */
async function safeUnlink(filePath) {
  if (!filePath) return false;
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`safeUnlink failed for ${filePath}:`, err.message);
    }
    return false;
  }
}

/**
 * Resolve a stored upload reference to a local path and delete it (non-blocking).
 * Skips remote S3/HTTP URLs — those objects live in the bucket and are cleaned
 * separately (tracked in the scaling/cleanup work), not on local disk.
 *
 * @param {string} storedPath e.g. "/uploads/events/img-123.jpg" (or a full S3 URL, which is skipped)
 * @returns {Promise<boolean>} true if a local file was deleted
 */
async function safeUnlinkUpload(storedPath) {
  if (!storedPath || typeof storedPath !== 'string') return false;
  if (/^https?:\/\//i.test(storedPath)) return false; // S3/remote URL — not a local file
  const localPath = path.join(process.cwd(), storedPath.replace('/uploads/', 'uploads/'));
  return safeUnlink(localPath);
}

module.exports = { safeUnlink, safeUnlinkUpload };
