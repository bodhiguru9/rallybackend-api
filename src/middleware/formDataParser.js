const multer = require('multer');

// Configure multer to handle form-data (without file uploads)
// This allows parsing multipart/form-data requests
const upload = multer();

// Middleware to parse form-data (for non-file fields only)
const parseFormData = upload.none();

module.exports = {
  parseFormData,
};

