const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Bond = require('../models/Bond');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');

// @route   GET /api/bond/status
// @desc    Get current user's bond status
// @access  Private
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('partnerId', 'username profilePic')
      .populate('sentRequests', 'username profilePic')
      .populate('receivedRequests', 'username profilePic');
    res.json({
      status: user.relationshipStatus,
      partner: user.partnerId,
      sentRequests: user.sentRequests,
      receivedRequests: user.receivedRequests,
      bondStartDate: user.bondStartDate
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/bond/request/:username
// @desc    Send a love request
// @access  Private
router.post('/request/:username', auth, async (req, res) => {
  try {
    const target = await User.findOne({ username: req.params.username });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target._id.toString() === req.userId)
      return res.status(400).json({ error: 'Cannot send request to yourself' });
    if (target.relationshipStatus !== 'single')
      return res.status(400).json({ error: 'This user is already in a relationship' });

    const currentUser = await User.findById(req.userId);
    if (currentUser.relationshipStatus !== 'single')
      return res.status(400).json({ error: 'You are already in a relationship' });

    if (currentUser.sentRequests.includes(target._id))
      return res.status(400).json({ error: 'Request already sent' });

    currentUser.sentRequests.push(target._id);
    target.receivedRequests.push(currentUser._id);
    await currentUser.save();
    await target.save();

    // Create notification
    await Notification.create({
      recipient: target._id,
      sender: currentUser._id,
      type: 'bond_request'
    });

    res.json({ message: 'Love request sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/bond/accept/:userId
// @desc    Accept a love request and create a shared Bond document
// @access  Private
router.post('/accept/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    const requester = await User.findById(req.params.userId);
    if (!requester) return res.status(404).json({ error: 'User not found' });

    if (!currentUser.receivedRequests.includes(requester._id))
      return res.status(400).json({ error: 'No request from this user' });

    // Update both users' relationship status
    currentUser.relationshipStatus = 'bonded';
    currentUser.partnerId = requester._id;
    currentUser.bondStartDate = new Date();
    currentUser.receivedRequests = currentUser.receivedRequests.filter(
      id => id.toString() !== requester._id.toString()
    );

    requester.relationshipStatus = 'bonded';
    requester.partnerId = currentUser._id;
    requester.bondStartDate = new Date();
    requester.sentRequests = requester.sentRequests.filter(
      id => id.toString() !== currentUser._id.toString()
    );

    await currentUser.save();
    await requester.save();

    // Create a shared Bond document
    const bond = new Bond({
      users: [currentUser._id, requester._id].sort(), // keep sorted
      bondData: {
        // Initialise with some default values
        anniversary: currentUser.bondStartDate?.toISOString().split('T')[0] || '',
        startDate: currentUser.bondStartDate?.toISOString().split('T')[0] || '',
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
    });
    await bond.save();

    // Notifications
    await Notification.create({
      recipient: requester._id,
      sender: currentUser._id,
      type: 'bond_accept'
    });
    await Notification.create({
      recipient: currentUser._id,
      sender: requester._id,
      type: 'bond_accept'
    });

    res.json({ message: 'Bond created', partner: requester.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/bond/reject/:userId
// @desc    Reject a love request
// @access  Private
router.post('/reject/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    const requester = await User.findById(req.params.userId);
    if (!requester) return res.status(404).json({ error: 'User not found' });

    if (!currentUser.receivedRequests.includes(requester._id))
      return res.status(400).json({ error: 'No request from this user' });

    currentUser.receivedRequests = currentUser.receivedRequests.filter(
      id => id.toString() !== requester._id.toString()
    );
    requester.sentRequests = requester.sentRequests.filter(
      id => id.toString() !== currentUser._id.toString()
    );

    await currentUser.save();
    await requester.save();

    res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== SHARED BOND ENDPOINTS ==========

// @route   GET /api/bond/shared
// @desc    Get the shared bond data for the current user (if bonded)
// @access  Private
router.get('/shared', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.relationshipStatus !== 'bonded' || !user.partnerId) {
      return res.status(403).json({ error: 'Not in a bonded relationship' });
    }

    const bond = await Bond.findOne({
      users: { $all: [user._id, user.partnerId] }
    });

    if (!bond) return res.status(404).json({ error: 'Bond not found' });

    res.json(bond);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
console.log('Bond routes loaded');
// @route   PUT /api/bond/shared
// @desc    Update the shared bond data
// @access  Private
router.put('/shared', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.relationshipStatus !== 'bonded' || !user.partnerId) {
      return res.status(403).json({ error: 'Not in a bonded relationship' });
    }

    const bond = await Bond.findOne({
      users: { $all: [user._id, user.partnerId] }
    });

    if (!bond) return res.status(404).json({ error: 'Bond not found' });

    // Merge updates into bondData
    bond.bondData = { ...bond.bondData, ...req.body };
    await bond.save();

    res.json(bond);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;