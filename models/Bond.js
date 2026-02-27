const mongoose = require('mongoose');

const BondSchema = new mongoose.Schema({
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    validate: [arrayLimit, '{PATH} must have exactly 2 users']
  }],
  bondData: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      anniversary: '',
      startDate: '',
      bondStatus: 'Strong',
      connectionStrength: 0,
      sharedPhotos: 0,
      savedNotes: 0,
      memories: [],
      diaryEntries: [],
      goals: [],
      commitments: [],
      recentMood: 'happy',
      interactions: 0,
    }
  }
}, { timestamps: true });

function arrayLimit(val) {
  return val.length === 2;
}

module.exports = mongoose.model('Bond', BondSchema);