const errorHandler = (err, req, res, next) => {
  // Default error
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error(err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((val) => val.message);
    error = { message, statusCode: 400 };
  }

  // Auth errors safety net: if service threw a known auth error without statusCode,
  // classify it as 401 rather than defaulting to 500
  const AUTH_ERROR_MESSAGES = [
    'Invalid credentials',
    'No password set',
    'Invalid OTP',
    'OTP has expired',
    'Invalid or expired OTP',
    'Invalid or expired verification token',
    'Verification token has expired',
    'Invalid or expired refresh token',
  ];
  if (!error.statusCode && AUTH_ERROR_MESSAGES.some(msg => err.message && err.message.startsWith(msg))) {
    error.statusCode = 401;
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;

