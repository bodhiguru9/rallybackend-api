const { connectDB, closeDB, getDB } = require('../src/config/database');
const { createAllIndexes } = require('../scripts/createIndexes');

// Mock Stripe globally to prevent live API calls
jest.mock('stripe', () => {
  return function() {
    return {
      paymentIntents: {
        create: jest.fn().mockImplementation((data) => Promise.resolve({
          id: 'pi_mock_' + Math.random().toString(36).substring(2),
          client_secret: 'pi_mock_secret_' + Math.random().toString(36).substring(2),
          amount: data.amount,
          currency: data.currency,
          status: 'requires_payment_method',
          description: data.description,
        })),
        retrieve: jest.fn().mockImplementation((id) => Promise.resolve({
          id: id,
          client_secret: 'pi_mock_secret_retrieved',
          amount: 2000,
          currency: 'aed',
          status: 'requires_payment_method',
        })),
      },
      customers: {
        create: jest.fn().mockImplementation((data) => Promise.resolve({
          id: 'cus_mock_' + Math.random().toString(36).substring(2),
          email: data.email,
          name: data.name,
        })),
      },
      refunds: {
        create: jest.fn().mockImplementation((data) => Promise.resolve({
          id: 're_mock_' + Math.random().toString(36).substring(2),
          status: 'succeeded',
        })),
      },
      webhooks: {
        constructEvent: jest.fn().mockImplementation((body, sig, secret) => {
          return JSON.parse(body.toString());
        }),
      },
    };
  };
});

// Mock Twilio globally to prevent live SMS/WhatsApp attempts
jest.mock('twilio', () => {
  const mockClient = {
    messages: {
      create: jest.fn().mockResolvedValue({ sid: 'sm_mock_sid' }),
    },
  };
  const mockFn = function() {
    return mockClient;
  };
  mockFn.jwt = {
    AccessToken: function() {
      return {
        addGrant: jest.fn(),
        toJwt: jest.fn().mockReturnValue('mock_jwt_token'),
      };
    },
  };
  mockFn.jwt.AccessToken.ChatGrant = function() {
    return {};
  };
  return mockFn;
});

// Mock Nodemailer globally to prevent live emails
jest.mock('nodemailer', () => {
  return {
    createTransport: jest.fn().mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'mock_email_message_id' }),
    }),
  };
});

beforeAll(async () => {
  // Enforce test environment
  process.env.NODE_ENV = 'test';
  // Ensure Stripe secret is defined for tests to avoid Stripe instantiation errors
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key_for_testing';
  
  // Establish connection
  await connectDB();
  // Ensure all indexes (including unique constraints) are created in the sandboxed test database
  await createAllIndexes(getDB());
});

afterAll(async () => {
  try {
    const db = getDB();
    // Fetch all collections in the database
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      if (col.name.endsWith('_test')) {
        console.log(`🧹 Cleaning up test collection: ${col.name}`);
        await db.collection(col.name).drop().catch(err => {
          // Ignore error if collection was already dropped
          if (err.codeName !== 'NamespaceNotFound') {
            console.error(`⚠️ Error dropping collection ${col.name}:`, err);
          }
        });
      }
    }
  } catch (error) {
    console.error('⚠️ Error during global cleanup of _test collections:', error);
  } finally {
    await closeDB();
  }
});
