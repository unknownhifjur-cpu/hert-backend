const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Bond = require('../models/Bond');          // <-- added shared Bond model
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
    const response = {
      status: user.relationshipStatus,
      partner: user.partnerId,
      sentRequests: user.sentRequests,
      receivedRequests: user.receivedRequests,
      bondStartDate: user.bondStartDate
    };
    // If bonded, also return bondId so frontend can fetch shared data
    if (user.relationshipStatus === 'bonded' && user.bondId) {
      response.bondId = user.bondId;
    }
    res.json(response);
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
// @desc    Accept a love request and create shared bond
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

    // Create a shared Bond document
    const bond = new Bond({
      users: [currentUser._id, requester._id],
      bondData: {
        startDate: new Date().toISOString().split('T')[0], // store as YYYY-MM-DD
        bondStatus: 'Strong',
        // other fields default to empty values
      }
    });
    await bond.save();

    // Store bondId in both users
    currentUser.bondId = bond._id;
    requester.bondId = bond._id;

    await currentUser.save();
    await requester.save();

    // Create notifications for both users
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

// ========== SHARED BOND DATA ENDPOINTS ==========

// @route   GET /api/bond/shared
// @desc    Get shared bond data (for bonded couples)
// @access  Private
router.get('/shared', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('bondId');
    if (!user || !user.bondId) {
      return res.status(404).json({ error: 'No shared bond found' });
    }
    // The bondId is populated, so we can return its bondData directly
    res.json(user.bondId.bondData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/bond/shared
// @desc    Update shared bond data
// @access  Private
router.put('/shared', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.bondId) {
      return res.status(404).json({ error: 'No shared bond found' });
    }

    const bond = await Bond.findById(user.bondId);
    if (!bond) return res.status(404).json({ error: 'Bond not found' });

    // Merge the existing bondData with the incoming updates
    bond.bondData = { ...bond.bondData, ...req.body };
    // Optionally update a timestamp inside bondData if needed, but the document's updatedAt will change automatically
    await bond.save();

    res.json(bond.bondData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== LEGACY PER‑USER BOND DATA ENDPOINTS (kept for compatibility) ==========

// @route   GET /api/bond/data
// @desc    Get current user's individual bond data (legacy)
// @access  Private
router.get('/data', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('bondData');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.bondData || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/bond/data
// @desc    Update current user's individual bond data (legacy)
// @access  Private
router.put('/data', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.bondData = { ...user.bondData, ...req.body };
    await user.save();

    res.json(user.bondData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;