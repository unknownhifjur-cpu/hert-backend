const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  profilePic: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    default: ''
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Bond / relationship fields (for love requests)
  relationshipStatus: {
    type: String,
    enum: ['single', 'pending', 'bonded'],
    default: 'single'
  },
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  sentRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  receivedRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  bondStartDate: {
    type: Date,
    default: null
  },
  // Reference to the shared Bond document
  bondId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bond',
    default: null
  },
  // Legacy bond data (per user) – kept for compatibility but not used in new system
  bondData: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      partnerName: '',
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
    })
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);