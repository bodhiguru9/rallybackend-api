const express = require('express');
const router = express.Router();

/**
 * @route   GET /api/app-config/version
 * @desc    Get the latest app version and store URLs
 * @access  Public
 */
router.get('/version', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      latestVersion: '1.1.0',
      minRequiredVersion: '1.0.0',
      storeUrls: {
        ios: 'https://apps.apple.com/in/app/rally-sports/id6526470249?platform=ipad',
        android: 'https://play.google.com/store/apps/details?id=com.rallysports.app&pcampaignid=web_share',
      },
      updateMessage: 'A new version of Rally is available! Please update to enjoy the latest features and improvements.',
    },
  });
});

module.exports = router;
