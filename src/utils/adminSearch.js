const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Normalize a search term to the bare digit string a stored mobileNumber
 * would contain, so "+971 55 189 9547", "971551899547", and the local
 * "0551899547" all match the same E.164-stored "+971551899547".
 *
 * Strips every non-digit character (so the stored "+" is never part of
 * the comparison), then drops a single leading 0 — the local-dialing
 * prefix that a country code never actually has in this data.
 */
const normalizePhoneDigits = (value) => {
  const digitsOnly = value.replace(/\D/g, '');
  return digitsOnly.startsWith('0') ? digitsOnly.slice(1) : digitsOnly;
};

module.exports = { escapeRegex, normalizePhoneDigits };
