const { S3_CONFIG } = require('../config/s3');

/**
 * Validates if the given URL is a valid snap URL owned by the user
 * @param {string} url - The URL to validate
 * @param {string|number} userId - The ID of the user who should own this snap
 * @returns {boolean} True if the URL is valid and owned by the user
 */
const isOwnedSnapUrl = (url, userId) => {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') return false;

    // The bucket host is typically something like 'bucket-name.s3.region.amazonaws.com'
    // Depending on exactly how S3_CONFIG is set up, this might need tweaking
    // But we know it must end with amazonaws.com or a known CDN if configured
    
    // Check if the path starts with /snaps/<userId>/
    // S3 URLs typically have the key as the pathname (minus the leading slash)
    const pathname = parsedUrl.pathname.startsWith('/') ? parsedUrl.pathname.substring(1) : parsedUrl.pathname;
    
    if (!pathname.startsWith(`snaps/${userId}/`)) {
      return false;
    }

    return true;
  } catch (error) {
    // URL parsing failed
    return false;
  }
};

/**
 * Extracts the S3 object key from a stored URL
 * @param {string} url - The full S3 URL
 * @returns {string|null} The object key, or null if invalid
 */
const extractS3Key = (url) => {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.startsWith('/') ? parsedUrl.pathname.substring(1) : parsedUrl.pathname;
    return pathname;
  } catch (error) {
    return null;
  }
};

module.exports = {
  isOwnedSnapUrl,
  extractS3Key,
};
