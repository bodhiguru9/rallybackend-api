const User = require('../../models/User');

const VALID_USER_TYPES = ['player', 'organiser'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164: a leading + then 7-15 digits, first digit 1-9 — matches how every
// mobileNumber in this database is actually stored (e.g. +971551899547).
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * @desc    Create a user account (admin panel only)
 * @route   POST /api/admin/create-user
 * @access  Admin key (adminKeyAuth)
 *
 * Bypasses the normal OTP-verification signup flow — the admin is
 * vouching for this account directly, so any email/mobile provided is
 * marked verified immediately. Restricted to player/organiser; creating
 * a superadmin account through this route is deliberately not supported.
 *
 * Body:
 * {
 *   userType: "player" | "organiser",
 *   fullName: string,
 *   email?: string,          // at least one of email/mobileNumber required
 *   mobileNumber?: string,   // must be E.164, e.g. +971551899547
 *   password?: string,       // optional — omit to let the user set one later
 *   // player only:
 *   dob?, gender?, sport1?, sport2?,
 *   // organiser only:
 *   communityName?, yourCity?, yourBest?, bio?, instagramLink?, profileVisibility?
 * }
 */
const createUser = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { userType, fullName } = body;

    if (!VALID_USER_TYPES.includes(userType)) {
      return res.status(400).json({ success: false, error: `userType must be one of: ${VALID_USER_TYPES.join(', ')}` });
    }

    if (typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ success: false, error: 'fullName is required' });
    }

    const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;
    const mobileNumber = typeof body.mobileNumber === 'string' && body.mobileNumber.trim() ? body.mobileNumber.trim() : null;

    if (!email && !mobileNumber) {
      return res.status(400).json({ success: false, error: 'At least one of email or mobileNumber is required' });
    }
    if (email && !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'email is not a valid email address' });
    }
    if (mobileNumber && !E164_REGEX.test(mobileNumber)) {
      return res.status(400).json({ success: false, error: 'mobileNumber must be in E.164 format, e.g. +971551899547' });
    }

    if (body.password !== undefined && body.password !== null) {
      if (typeof body.password !== 'string' || body.password.trim().length < 6) {
        return res.status(400).json({ success: false, error: 'password must be at least 6 characters' });
      }
    }

    if (email && (await User.findByEmail(email))) {
      return res.status(409).json({ success: false, error: 'A user with this email already exists' });
    }
    if (mobileNumber && (await User.findByMobileNumber(mobileNumber))) {
      return res.status(409).json({ success: false, error: 'A user with this mobile number already exists' });
    }

    const createData = {
      userType,
      fullName: fullName.trim(),
      email,
      mobileNumber,
      password: body.password && body.password.trim() ? body.password.trim() : null,
      profilePic: body.profilePic || null,
      isEmailVerified: !!email,
      isMobileVerified: !!mobileNumber,
    };

    if (userType === 'player') {
      createData.dob = body.dob ? new Date(body.dob) : null;
      createData.gender = body.gender ? String(body.gender).toLowerCase() : null;
      createData.sport1 = body.sport1 ? String(body.sport1).trim() : null;
      createData.sport2 = body.sport2 ? String(body.sport2).trim() : null;
      createData.sports = [createData.sport1, createData.sport2].filter(Boolean);
    } else if (userType === 'organiser') {
      createData.dob = body.dob ? new Date(body.dob) : null;
      createData.gender = body.gender ? String(body.gender).toLowerCase() : null;
      createData.sport1 = body.sport1 ? String(body.sport1).trim() : null;
      createData.sport2 = body.sport2 ? String(body.sport2).trim() : null;
      createData.sports = [createData.sport1, createData.sport2].filter(Boolean);
      createData.yourBest = body.yourBest ? String(body.yourBest).toLowerCase() : null;
      createData.communityName = body.communityName ? String(body.communityName).trim() : null;
      createData.yourCity = body.yourCity ? String(body.yourCity).trim() : null;
      createData.bio = body.bio ? String(body.bio).trim() : null;
      createData.instagramLink = body.instagramLink ? String(body.instagramLink).trim() : null;
      createData.profileVisibility = body.profileVisibility ? String(body.profileVisibility).toLowerCase() : 'private';
    }

    const user = await User.create(createData);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        userId: user.userId,
        mongoId: user._id.toString(),
        userType: user.userType,
        fullName: user.fullName,
        email: user.email,
        mobileNumber: user.mobileNumber,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createUser };
