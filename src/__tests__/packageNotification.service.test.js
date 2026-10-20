/**
 * packageNotification.service.test.js
 *
 * Unit tests for notifySubscribersOnPackageCreation.
 * DB and push.service are fully mocked.
 */

'use strict';

const { ObjectId } = require('mongodb');

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSendPushToMany = jest.fn().mockResolvedValue({ sentCount: 2, failedCount: 0 });

jest.mock('../services/push.service', () => ({
  sendPushToMany: mockSendPushToMany,
}));

const mockInsertMany = jest.fn().mockResolvedValue({ insertedCount: 2 });
const mockFindFollows = jest.fn();
const mockFindUsers = jest.fn();
const mockFindOneUser = jest.fn();

const mockCollection = jest.fn((colName) => {
  if (colName === 'follows') {
    return {
      find: mockFindFollows,
    };
  }
  if (colName === 'users') {
    return {
      find: mockFindUsers,
      findOne: mockFindOneUser,
    };
  }
  if (colName === 'notifications') {
    return {
      insertMany: mockInsertMany,
    };
  }
  return {};
});

jest.mock('../config/database', () => ({
  getDB: jest.fn(() => ({
    collection: mockCollection,
  })),
}));

const { notifySubscribersOnPackageCreation } = require('../services/packageNotification.service');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('packageNotification.service — notifySubscribersOnPackageCreation', () => {
  const organiserId = new ObjectId('507f1f77bcf86cd799439011');
  const subscriber1Id = new ObjectId('507f1f77bcf86cd799439012');
  const subscriber2Id = new ObjectId('507f1f77bcf86cd799439013');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 0 subscribers and skips push when organiser has no followers', async () => {
    mockFindFollows.mockReturnValue({
      project: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      }),
    });

    const result = await notifySubscribersOnPackageCreation({
      organiserId,
      package: { packageId: 'PKG1', packageName: 'Summer Badminton Pass', packagePrice: 150 },
      organiser: { fullName: 'Coach Sarah', communityName: 'Dubai Smashers' },
    });

    expect(result.success).toBe(true);
    expect(result.totalSubscribers).toBe(0);
    expect(result.pushSentCount).toBe(0);
    expect(mockSendPushToMany).not.toHaveBeenCalled();
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  test('sends push and creates in-app notifications for subscribers with FCM tokens', async () => {
    // Organiser has 2 followers
    mockFindFollows.mockReturnValue({
      project: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { followerId: subscriber1Id },
          { followerId: subscriber2Id },
        ]),
      }),
    });

    // Both subscribers found in users collection with FCM tokens
    mockFindUsers.mockReturnValue({
      project: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { _id: subscriber1Id, fcmToken: 'fcm-token-1', userType: 'player' },
          { _id: subscriber2Id, fcmToken: 'fcm-token-2', userType: 'player' },
        ]),
      }),
    });

    const pkg = {
      packageId: 'PKG101',
      packageName: 'Premium Tennis Club Pass',
      packagePrice: 300,
      imageUri: 'https://example.com/tennis.jpg',
    };

    const organiser = {
      fullName: 'Coach Alex',
      communityName: 'Ace Tennis Academy',
    };

    const result = await notifySubscribersOnPackageCreation({
      organiserId,
      package: pkg,
      organiser,
    });

    expect(result.success).toBe(true);
    expect(result.totalSubscribers).toBe(2);
    expect(result.pushSentCount).toBe(2);

    // Verify push service was called with correct structure
    expect(mockSendPushToMany).toHaveBeenCalledTimes(1);
    const pushCallArgs = mockSendPushToMany.mock.calls[0][0];
    expect(pushCallArgs.tokens).toEqual(['fcm-token-1', 'fcm-token-2']);
    expect(pushCallArgs.title).toBe('New Package from Ace Tennis Academy');
    expect(pushCallArgs.body).toContain('Ace Tennis Academy just published a new package: "Premium Tennis Club Pass"');
    expect(pushCallArgs.imageUrl).toBe('https://example.com/tennis.jpg');
    expect(pushCallArgs.data).toEqual({
      type: 'new_package',
      packageId: 'PKG101',
      packageName: 'Premium Tennis Club Pass',
      organiserId: organiserId.toString(),
      organiserName: 'Ace Tennis Academy',
      packagePrice: '300',
    });

    // Verify in-app notifications were created
    expect(mockInsertMany).toHaveBeenCalledTimes(1);
    const notifDocs = mockInsertMany.mock.calls[0][0];
    expect(notifDocs).toHaveLength(2);
    expect(notifDocs[0].recipientId).toEqual(subscriber1Id);
    expect(notifDocs[0].type).toBe('new_package');
    expect(notifDocs[0].data.packageId).toBe('PKG101');
    expect(notifDocs[0].data.organiserId).toBe(organiserId.toString());
  });

  test('excludes the organiser themselves if present in followers list', async () => {
    // Followers list includes the organiser themselves
    mockFindFollows.mockReturnValue({
      project: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { followerId: organiserId },
          { followerId: subscriber1Id },
        ]),
      }),
    });

    mockFindUsers.mockReturnValue({
      project: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { _id: subscriber1Id, fcmToken: 'fcm-token-1', userType: 'player' },
        ]),
      }),
    });

    const result = await notifySubscribersOnPackageCreation({
      organiserId,
      package: { packageId: 'PKG2', packageName: 'Yoga Monthly' },
      organiser: { communityName: 'Zen Yoga' },
    });

    expect(result.totalSubscribers).toBe(1);
    expect(mockSendPushToMany).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['fcm-token-1'],
      })
    );
  });

  test('fetches organiser from database when not passed in arguments', async () => {
    mockFindFollows.mockReturnValue({
      project: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([{ followerId: subscriber1Id }]),
      }),
    });

    mockFindUsers.mockReturnValue({
      project: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { _id: subscriber1Id, fcmToken: 'token-1', userType: 'player' },
        ]),
      }),
    });

    mockFindOneUser.mockResolvedValue({
      _id: organiserId,
      communityName: 'Desert Padel Club',
      fullName: 'Ahmed Organizer',
    });

    await notifySubscribersOnPackageCreation({
      organiserId,
      package: { packageId: 'PKG9', packageName: 'Padel Weekend Pass' },
    });

    expect(mockFindOneUser).toHaveBeenCalledWith({ _id: organiserId });
    expect(mockSendPushToMany).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New Package from Desert Padel Club',
      })
    );
  });

  test('does not call push if subscribers have empty FCM tokens, but saves in-app', async () => {
    mockFindFollows.mockReturnValue({
      project: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([{ followerId: subscriber1Id }]),
      }),
    });

    mockFindUsers.mockReturnValue({
      project: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          { _id: subscriber1Id, fcmToken: null, userType: 'player' },
        ]),
      }),
    });

    const result = await notifySubscribersOnPackageCreation({
      organiserId,
      package: { packageId: 'PKG3', packageName: 'Cricket Camp' },
      organiser: { fullName: 'Coach Ravi' },
    });

    expect(result.success).toBe(true);
    expect(mockSendPushToMany).not.toHaveBeenCalled();
    expect(mockInsertMany).toHaveBeenCalledTimes(1);
  });
});
