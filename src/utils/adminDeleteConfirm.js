const normalize = (value) => (value === null || value === undefined ? '' : String(value).trim());

/**
 * Validates an admin delete confirm payload against the target user.
 *
 * email + mobileNumber must always match. The third field differs by
 * type: organisers have a real bio, which is a genuine differentiator
 * between accounts; other users don't have one (it's always empty), so
 * their exact account-creation timestamp (createdAt) is used instead —
 * a value the admin panel must have displayed, not something guessable
 * from the delete request alone.
 */
const confirmMatchesTarget = (user, confirm) => {
  if (!confirm || typeof confirm !== 'object') return false;

  const emailMatches = normalize(confirm.email).toLowerCase() === normalize(user.email).toLowerCase();
  const mobileMatches = normalize(confirm.mobileNumber) === normalize(user.mobileNumber);
  if (!emailMatches || !mobileMatches) return false;

  if (user.userType === 'organiser') {
    return normalize(confirm.bio) === normalize(user.bio);
  }

  if (!confirm.createdAt) return false;
  const confirmDate = new Date(confirm.createdAt);
  const userDate = new Date(user.createdAt);
  if (Number.isNaN(confirmDate.getTime()) || Number.isNaN(userDate.getTime())) return false;
  return confirmDate.getTime() === userDate.getTime();
};

module.exports = { confirmMatchesTarget };
