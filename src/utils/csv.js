/**
 * Minimal CSV writer (no dependency).
 * Cells that start with = + - @ are prefixed with a single quote so spreadsheets don't run them as formulas.
 */
function escapeCell(value) {
  if (value === null || value === undefined) {
    return '';
  }
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * @param {string[]} headers
 * @param {Array<Array<*>>} rows
 * @returns {string} CSV text with a UTF-8 BOM (so Excel reads non-ASCII names correctly)
 */
function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  const BOM = String.fromCharCode(0xfeff);
  return BOM + lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv, escapeCell };
