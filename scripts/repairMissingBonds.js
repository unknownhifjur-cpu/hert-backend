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

async function repairMissingBonds() {
  try {
    console.log('🔍 Looking for bonded users with missing Bond documents...');
    
    // Find all bonded users that have a bondId set
    const bondedUsers = await User.find({ relationshipStatus: 'bonded', bondId: { $ne: null } });
    console.log(`Found ${bondedUsers.length} bonded users with bondId.`);

    let missingCount = 0;
    const pairsToRepair = new Map();

    for (const user of bondedUsers) {
      // Check if the referenced Bond exists
      const bondExists = await Bond.exists({ _id: user.bondId });
      if (!bondExists) {
        console.log(`⚠️ Bond missing for user ${user._id} (bondId: ${user.bondId})`);
        missingCount++;
        
        // Group by partner pair
        if (!user.partnerId) {
          console.log(`  -> User ${user._id} has no partnerId, skipping.`);
          continue;
        }
        const key = [user._id.toString(), user.partnerId.toString()].sort().join('_');
        pairsToRepair.set(key, { user1: user._id, user2: user.partnerId });
      }
    }

    if (missingCount === 0) {
      console.log('✅ All bonds are intact.');
    } else {
      console.log(`\n🛠️ Repairing ${pairsToRepair.size} missing bonds...`);
      for (const pair of pairsToRepair.values()) {
        // Fetch both users to get start dates
        const [user1, user2] = await Promise.all([
          User.findById(pair.user1),
          User.findById(pair.user2)
        ]);

        let startDate = null;
        if (user1?.bondStartDate && user2?.bondStartDate) {
          startDate = new Date(Math.min(new Date(user1.bondStartDate), new Date(user2.bondStartDate)));
        } else if (user1?.bondStartDate) {
          startDate = user1.bondStartDate;
        } else if (user2?.bondStartDate) {
          startDate = user2.bondStartDate;
        } else {
          startDate = new Date(); // fallback to today
        }

        const bond = new Bond({
          users: [pair.user1, pair.user2],
          bondData: {
            startDate: startDate.toISOString().split('T')[0],
            bondStatus: 'Strong',
          }
        });
        await bond.save();

        // Update both users with the new bondId (they already have one, but we replace it)
        await User.updateMany(
          { _id: { $in: [pair.user1, pair.user2] } },
          { $set: { bondId: bond._id } }
        );
        console.log(`✅ Bond recreated for users ${pair.user1} and ${pair.user2} with start date ${startDate.toISOString().split('T')[0]}`);
      }
    }
  } catch (err) {
    console.error('🔥 Error:', err);
  } finally {
    mongoose.disconnect();
  }
}

repairMissingBonds();