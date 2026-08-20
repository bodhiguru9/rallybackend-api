require('dotenv').config();

const {
  connectDB,
  getDB,
  closeDB,
} = require('../src/config/database');

const User = require('../src/models/User');

const USER_IDS = [1087, 198, 1353, 607, 1578, 1865];

async function main() {
  await connectDB();

  const db = getDB();
  const users = db.collection('users');

  console.log('');
  console.log('======================================');
  console.log('DELETE 6 DISPUTED USERS');
  console.log('======================================');

  let deleted = 0;
  let notFound = 0;
  let failed = 0;

  for (const userId of USER_IDS) {
    try {
      const user = await users.findOne({ userId });

      if (!user) {
        notFound++;
        console.log(`NOT FOUND | userId=${userId}`);
        continue;
      }

      const mongoId = user._id;

      // Remove login tokens
      await db.collection('tokens').deleteMany({
        userId: mongoId,
      });

      // Remove follow relationships
      await db.collection('follows').deleteMany({
        $or: [
          { followerId: mongoId },
          { followingId: mongoId },
        ],
      });

      // Remove any player-linked data
      await db.collection('eventJoins').deleteMany({ userId: mongoId });
      await db.collection('eventJoinRequests').deleteMany({ userId: mongoId });
      await db.collection('requests').deleteMany({ userId: mongoId });
      await db.collection('waitlist').deleteMany({ userId: mongoId });
      await db.collection('packagePurchases').deleteMany({ userId: mongoId });
      await db.collection('bookings').deleteMany({ userId: mongoId });
      await db.collection('payments').deleteMany({ userId: mongoId });
      await db.collection('favorites').deleteMany({ userId: mongoId });
      await db.collection('savedCards').deleteMany({ userId: mongoId });
      await db.collection('eventBlocks').deleteMany({ userId: mongoId });
      await db.collection('eventReminders').deleteMany({ userId: mongoId });

      await db.collection('blocks').deleteMany({
        $or: [
          { blockerId: mongoId },
          { blockedId: mongoId },
        ],
      });

      await db.collection('eventInvites').deleteMany({
        $or: [
          { organiserId: mongoId },
          { playerId: mongoId },
        ],
      });

      await db.collection('notifications').deleteMany({
        $or: [
          { recipientId: mongoId },
          { 'data.userId': mongoId },
          { 'data.userId': mongoId.toString() },
          { 'data.organiserId': mongoId },
          { 'data.organiserId': mongoId.toString() },
          { 'data.playerId': mongoId },
          { 'data.playerId': mongoId.toString() },
        ],
      });

      const success = await User.deleteById(mongoId);

      if (!success) {
        failed++;
        console.log(`FAILED | userId=${userId}`);
        continue;
      }

      deleted++;

      console.log(
        `DELETED | userId=${userId}` +
        ` | ${user.fullName || '-'}` +
        ` | ${user.email || '-'}`
      );
    } catch (err) {
      failed++;
      console.error(
        `ERROR | userId=${userId} | ${err.message}`
      );
    }
  }

  console.log('');
  console.log('======================================');
  console.log('DELETE SUMMARY');
  console.log('======================================');
  console.log(`Deleted:    ${deleted}`);
  console.log(`Not found:  ${notFound}`);
  console.log(`Failed:     ${failed}`);
  console.log('======================================');

  await closeDB();
}

main().catch(async (err) => {
  console.error(err);

  try {
    await closeDB();
  } catch (_) {}

  process.exit(1);
});