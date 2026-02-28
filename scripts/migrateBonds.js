// server/scripts/migrateBonds.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');
const Bond = require('../models/Bond');

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment.');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ Connection error', err);
    process.exit(1);
  });

async function migrateBonds() {
  try {
    console.log('Starting bond migration...');
    const bondedUsers = await User.find({ relationshipStatus: 'bonded', bondId: null });
    console.log(`Found ${bondedUsers.length} bonded users without bondId.`);

    const pairs = new Map();
    for (const user of bondedUsers) {
      if (!user.partnerId) continue;
      const key = [user._id.toString(), user.partnerId.toString()].sort().join('_');
      if (!pairs.has(key)) {
        pairs.set(key, { user1: user._id, user2: user.partnerId });
      }
    }

    console.log(`Creating bonds for ${pairs.size} unique couples.`);
    for (const pair of pairs.values()) {
      const bond = new Bond({
        users: [pair.user1, pair.user2],
        bondData: {
          startDate: new Date().toISOString().split('T')[0], // you may want to use existing bondStartDate
          bondStatus: 'Strong',
        }
      });
      await bond.save();
      await User.updateMany(
        { _id: { $in: [pair.user1, pair.user2] } },
        { $set: { bondId: bond._id } }
      );
      console.log(`✅ Bond created for users ${pair.user1} and ${pair.user2}`);
    }

    console.log('🎉 Migration complete.');
  } catch (err) {
    console.error('🔥 Migration error:', err);
  } finally {
    mongoose.disconnect();
  }
}

migrateBonds();