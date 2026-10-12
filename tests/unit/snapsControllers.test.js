const { addSnap } = require('../../src/controllers/user/addSnap.controller');
const { deleteSnap } = require('../../src/controllers/user/deleteSnap.controller');

describe('Snaps Controllers Auth & Validation', () => {
  let mockRes;
  let next;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('addSnap authorization', () => {
    it('returns 403 when sequential userId does not match id parameter', async () => {
      const req = {
        params: { id: '9999' },
        body: { urls: ['https://rally-media.s3.ap-south-1.amazonaws.com/snaps/2588/test.jpg'] },
        user: {
          id: '67e3a1b2c3d4e5f6a7b8c9d0',
          userId: 2588,
          userType: 'organiser',
        },
      };

      await addSnap(req, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Unauthorized to add snaps for this user' })
      );
    });

    it('returns 403 when caller is not an organiser', async () => {
      const req = {
        params: { id: '2588' },
        body: { urls: ['https://rally-media.s3.ap-south-1.amazonaws.com/snaps/2588/test.jpg'] },
        user: {
          id: '67e3a1b2c3d4e5f6a7b8c9d0',
          userId: 2588,
          userType: 'player',
        },
      };

      await addSnap(req, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Only organisers can add snaps' })
      );
    });

    it('allows organiser with matching sequential userId (does not return 403)', async () => {
      const req = {
        params: { id: '2588' },
        body: { urls: [] }, // Empty array will fail with 400, proving auth passed
        user: {
          id: '67e3a1b2c3d4e5f6a7b8c9d0',
          userId: 2588,
          userType: 'organiser',
        },
      };

      await addSnap(req, mockRes, next);

      // Auth passed, rejected on validation (400), NOT 403!
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('urls array is required') })
      );
    });
  });

  describe('deleteSnap authorization', () => {
    it('returns 403 when user ID does not match parameter', async () => {
      const req = {
        params: { id: '9999', snapId: 'snap-1' },
        user: {
          id: '67e3a1b2c3d4e5f6a7b8c9d0',
          userId: 2588,
          userType: 'organiser',
        },
      };

      await deleteSnap(req, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Unauthorized to delete snaps for this user' })
      );
    });
  });
});
