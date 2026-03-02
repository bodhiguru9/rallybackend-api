const { getDB } = require('../../config/database');
const { ObjectId } = require('mongodb');
const EventInvite = require('../../models/EventInvite');

/**
 * @desc    Delete an invitation (cleanup)
 * @route   DELETE /api/event-invites/:inviteId
 * @access  Private (Player can delete their own; Organiser can delete their sent)
 *
 * Note: Pending invitations cannot be deleted (accept/decline/cancel first).
 */
const deleteInvite = async (req, res, next) => {
  try {
    const { inviteId } = req.params;
    const actorId = req.user.id;
    const userType = req.user.userType;

    const db = getDB();
    const invitesCollection = db.collection('eventInvites');

    const invite = await EventInvite.getInviteById(inviteId);
    if (!invite) {
      return res.status(404).json({ success: false, error: 'Invitation not found' });
    }

    if (invite.status === 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Pending invitations cannot be deleted. Accept/decline (player) or cancel (organiser) first.',
      });
    }

    if (userType === 'player') {
      if (invite.playerId?.toString() !== actorId) {
        return res.status(403).json({ success: false, error: 'You can only delete your own invitations' });
      }
      const result = await invitesCollection.deleteOne({
        _id: invite._id,
        playerId: new ObjectId(actorId),
      });
      if (!result.deletedCount) return res.status(400).json({ success: false, error: 'Failed to delete invitation' });
    } else if (userType === 'organiser') {
      if (invite.organiserId?.toString() !== actorId) {
        return res.status(403).json({ success: false, error: 'You can only delete invitations you sent' });
      }
      const result = await invitesCollection.deleteOne({
        _id: invite._id,
        organiserId: new ObjectId(actorId),
      });
      if (!result.deletedCount) return res.status(400).json({ success: false, error: 'Failed to delete invitation' });
    } else {
      return res.status(403).json({ success: false, error: 'Only players or organisers can delete invitations' });
    }

    return res.status(200).json({
      success: true,
      message: 'Invitation deleted successfully',
      data: { inviteId: invite.inviteId || inviteId },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { deleteInvite };

