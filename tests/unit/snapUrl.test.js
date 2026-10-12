const { isOwnedSnapUrl, extractS3Key } = require('../../src/utils/snapUrl');

describe('snapUrl Utilities', () => {
  describe('isOwnedSnapUrl', () => {
    it('returns true for a valid HTTPS snap URL owned by the user', () => {
      const url = 'https://rally-media.s3.ap-south-1.amazonaws.com/snaps/42/img-123.jpg';
      expect(isOwnedSnapUrl(url, 42)).toBe(true);
      expect(isOwnedSnapUrl(url, '42')).toBe(true);
    });

    it('returns true for a valid HTTPS snap URL owned by the user (matching altUserId)', () => {
      const url = 'https://rally-media.s3.ap-south-1.amazonaws.com/snaps/2588/img-123.jpg';
      expect(isOwnedSnapUrl(url, '67e3a1b2c3d4e5f6a7b8c9d0', 2588)).toBe(true);
    });

    it('returns false if neither userId nor altUserId matches the URL prefix', () => {
      const url = 'https://rally-media.s3.ap-south-1.amazonaws.com/snaps/99/img-123.jpg';
      expect(isOwnedSnapUrl(url, 42)).toBe(false);
      expect(isOwnedSnapUrl(url, 42, 43)).toBe(false);
    });

    it('returns false for insecure http URLs', () => {
      const url = 'http://rally-media.s3.ap-south-1.amazonaws.com/snaps/42/img-123.jpg';
      expect(isOwnedSnapUrl(url, 42)).toBe(false);
    });

    it('returns false for URLs outside the snaps/ folder', () => {
      const url = 'https://rally-media.s3.ap-south-1.amazonaws.com/profiles/42/avatar.jpg';
      expect(isOwnedSnapUrl(url, 42)).toBe(false);
    });

    it('returns false for malformed URLs', () => {
      expect(isOwnedSnapUrl('not-a-url', 42)).toBe(false);
      expect(isOwnedSnapUrl('', 42)).toBe(false);
      expect(isOwnedSnapUrl(null, 42)).toBe(false);
      expect(isOwnedSnapUrl(undefined, 42)).toBe(false);
    });
  });

  describe('extractS3Key', () => {
    it('extracts the S3 key without leading slash from a full URL', () => {
      const url = 'https://rally-media.s3.ap-south-1.amazonaws.com/snaps/42/img-123.jpg';
      expect(extractS3Key(url)).toBe('snaps/42/img-123.jpg');
    });

    it('returns null for an invalid URL', () => {
      expect(extractS3Key('invalid-url')).toBeNull();
      expect(extractS3Key(null)).toBeNull();
    });
  });
});
