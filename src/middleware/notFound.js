const notFound = (req, res, next) => {
  // Check if it's a method mismatch (e.g., GET on POST route)
  const commonRoutes = {
    '/api/auth/signup': 'POST',
    '/api/auth/signin': 'POST',
    '/api/auth/superadmin/signin': 'POST',
    '/api/auth/superadmin-signin': 'POST',
    '/api/auth/email-login': 'POST',
    '/api/auth/whatsapp-login': 'POST',
    '/api/auth/verify-whatsapp-login': 'POST',
    '/api/auth/forgot-password': 'POST',
    '/api/auth/verify-otp': 'POST',
    '/api/auth/resend-otp': 'POST',
  };

  const requiredMethod = commonRoutes[req.originalUrl.split('?')[0]];
  
  if (requiredMethod && req.method !== requiredMethod) {
    const error = new Error(`Method ${req.method} not allowed. Use ${requiredMethod} for ${req.originalUrl.split('?')[0]}`);
    res.status(405).json({
      success: false,
      error: error.message,
      method: req.method,
      requiredMethod: requiredMethod,
      path: req.originalUrl.split('?')[0],
    });
    return;
  }

  // Check if it's a POST to /api/events/all (should be GET)
  if (req.originalUrl.split('?')[0] === '/api/events/all' && req.method === 'POST') {
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed. Use GET for /api/events/all`,
      method: req.method,
      requiredMethod: 'GET',
      path: '/api/events/all',
      description: 'This endpoint returns all events (public and private) with complete data. Use GET method.',
      example: 'GET /api/events/all?limit=100&skip=0',
    });
  }

  // Check if it's a POST to /api/events/:eventId (common mistake)
  const eventIdPattern = /^\/api\/events\/([a-fA-F0-9]{24}|E\d+)$/;
  const match = req.originalUrl.split('?')[0].match(eventIdPattern);
  
  if (match && req.method === 'POST') {
    const eventId = match[1];
    return res.status(400).json({
      success: false,
      error: `Invalid endpoint. POST requests to /api/events/:eventId are not supported.`,
      eventId: eventId,
      suggestions: [
        {
          action: 'Join public event',
          endpoint: `POST /api/events/${eventId}/join`,
          description: 'Use this endpoint to join a public event directly',
        },
        {
          action: 'Request to join (private or approval-required event)',
          endpoint: `POST /api/events/${eventId}/join-request`,
          description: 'Use this endpoint to create a join request; organiser gets a notification',
        },
        {
          action: 'Get event details',
          endpoint: `GET /api/events/${eventId}`,
          description: 'Use this endpoint to get event information',
        },
      ],
    });
  }

  // Check if it's a waitlist route without /accept or /reject
  const waitlistPattern = /^\/api\/events\/([a-fA-F0-9]{24}|E\d+|W\d+)\/waitlist\/([a-fA-F0-9]{24}|W\d+)\/?$/;
  const waitlistMatch = req.originalUrl.split('?')[0].replace(/\/$/, '').match(waitlistPattern);
  
  if (waitlistMatch && req.method === 'POST') {
    const eventId = waitlistMatch[1];
    const waitlistId = waitlistMatch[2];
    return res.status(400).json({
      success: false,
      error: `Invalid waitlist endpoint. Missing action (/accept or /reject).`,
      eventId: eventId,
      waitlistId: waitlistId,
      suggestions: [
        {
          action: 'Accept from waitlist',
          endpoint: `POST /api/events/${eventId}/waitlist/${waitlistId}/accept`,
          description: 'Use this endpoint to accept a user from waitlist',
        },
        {
          action: 'Reject from waitlist',
          endpoint: `POST /api/events/${eventId}/waitlist/${waitlistId}/reject`,
          description: 'Use this endpoint to reject a user from waitlist',
        },
        {
          action: 'Get waitlist',
          endpoint: `GET /api/events/${eventId}/waitlist`,
          description: 'Use this endpoint to get all pending waitlist requests',
        },
      ],
    });
  }

  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

module.exports = notFound;

