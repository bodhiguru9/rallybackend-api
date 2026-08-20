require('dotenv').config();

const { connectDB, getDB, closeDB } = require('../src/config/database');

const USER_IDS = [1087, 198, 1353, 607, 1578, 1865];

async function main() {
  await connectDB();

  const db = getDB();
  const users = db.collection('users');

  console.log('');
  console.log('======================================');
  console.log('6 USER DELETE - DRY RUN');
  console.log('======================================');

  for (const userId of USER_IDS) {
    const user = await users.findOne({ userId });

    if (!user) {
      console.log('');
      console.log(`USER ${userId}: NOT FOUND`);
      continue;
    }

    const mongoId = user._id;

    const counts = {
      tokens: await db.collection('tokens').countDocuments({
        userId: mongoId,
      }),

      followsAsFollower: await db.collection('follows').countDocuments({
        followerId: mongoId,
      }),

      followsAsFollowing: await db.collection('follows').countDocuments({
        followingId: mongoId,
      }),

      eventJoins: await db.collection('eventJoins').countDocuments({
        userId: mongoId,
      }),

      requests: await db.collection('requests').countDocuments({
        userId: mongoId,
      }),

      waitlist: await db.collection('waitlist').countDocuments({
        userId: mongoId,
      }),

      bookings: await db.collection('bookings').countDocuments({
        userId: mongoId,
      }),

      payments: await db.collection('payments').countDocuments({
        userId: mongoId,
      }),

      packagePurchases: await db.collection('packagePurchases').countDocuments({
        userId: mongoId,
      }),

      favorites: await db.collection('favorites').countDocuments({
        userId: mongoId,
      }),

      savedCards: await db.collection('savedCards').countDocuments({
        userId: mongoId,
      }),

      eventReminders: await db.collection('eventReminders').countDocuments({
        userId: mongoId,
      }),

      eventJoinRequests: await db.collection('eventJoinRequests').countDocuments({
        userId: mongoId,
      }),
    };

    console.log('');
    console.log('--------------------------------------');
    console.log(`userId:        ${user.userId}`);
    console.log(`Mongo _id:     ${user._id}`);
    console.log(`userType:      ${user.userType}`);
    console.log(`fullName:      ${user.fullName || '-'}`);
    console.log(`email:         ${user.email || '-'}`);
    console.log(`mobileNumber:  ${user.mobileNumber || '-'}`);
    console.log('Related records:');
    console.log(counts);
  }

  console.log('');
  console.log('======================================');
  console.log('DRY RUN ONLY - NOTHING WAS DELETED');
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