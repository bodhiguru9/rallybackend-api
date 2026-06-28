const request = require('supertest');
const express = require('express');

describe('Request Timeout Middleware', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Apply the same timeout middleware used in index.js
    app.use('/api', (req, res, next) => {
      res.setTimeout(1000, () => { // 1 second for test speed
        if (!res.headersSent) {
          res.status(503).json({
            success: false,
            error: 'Request timed out. Please try again.',
          });
        }
      });
      next();
    });

    // A route that hangs (simulates a slow query)
    app.get('/api/slow', (req, res) => {
      // Never responds — timeout should fire
    });

    // A route that responds quickly
    app.get('/api/fast', (req, res) => {
      res.status(200).json({ success: true, data: 'fast' });
    });
  });

  it('should return 503 for a route that exceeds the timeout', async () => {
    const res = await request(app).get('/api/slow');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('timed out');
  }, 5000); // Jest timeout 5s to allow the 1s server timeout to fire

  it('should NOT affect routes that respond before the timeout', async () => {
    const res = await request(app).get('/api/fast');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBe('fast');
  });

  it('should return proper JSON structure on timeout', async () => {
    const res = await request(app).get('/api/slow');

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual({
      success: false,
      error: 'Request timed out. Please try again.',
    });
  }, 5000);
});
