const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// @route   GET /api/bond/status
// @desc    Get current user's bond status, partner, and pending requests
// @access  Private
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('partner', 'username profilePic')
      .populate('sentRequests', 'username profilePic')
      .populate('receivedRequests', 'username profilePic');

    res.json({
      status: user.bondStatus,
      partner: user.partner,
      sentRequests: user.sentRequests,
      receivedRequests: user.receivedRequests,
      bondId: user.bondId
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/bond/request/:username
// @desc    Send a bond request to another user
// @access  Private
router.post('/request/:username', auth, async (req, res) => {
  try {
    const sender = await User.findById(req.userId);
    const recipient = await User.findOne({ username: req.params.username });

    if (!recipient) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (sender.username === recipient.username) {
      return res.status(400).json({ error: 'You cannot bond with yourself' });
    }

    // Check if sender is already bonded or pending
    if (sender.bondStatus !== 'none') {
      return res.status(400).json({ error: 'You already have a bond or pending request' });
    }

    // Check if recipient is available (optional)
    if (recipient.bondStatus !== 'none') {
      return res.status(400).json({ error: 'This user is not available for bonding' });
    }

    // Check if request already exists
    if (sender.sentRequests.includes(recipient._id) || recipient.receivedRequests.includes(sender._id)) {
      return res.status(400).json({ error: 'Request already sent' });
    }

    // Add to each other's lists
    sender.sentRequests.push(recipient._id);
    recipient.receivedRequests.push(sender._id);

    // Update sender's status to pending
    sender.bondStatus = 'pending';

    await sender.save();
    await recipient.save();

    res.json({ message: 'Bond request sent' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/bond/accept/:userId
// @desc    Accept a bond request
// @access  Private
router.post('/accept/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    const requester = await User.findById(req.params.userId);

    if (!requester) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify that the requester is in current user's receivedRequests
    if (!currentUser.receivedRequests.includes(requester._id)) {
      return res.status(400).json({ error: 'No request from this user' });
    }

    // Check that both users are in 'pending' state (optional)
    if (currentUser.bondStatus !== 'pending' || requester.bondStatus !== 'pending') {
      return res.status(400).json({ error: 'Bond request is not pending' });
    }

    // Remove from request lists
    currentUser.receivedRequests = currentUser.receivedRequests.filter(
      id => id.toString() !== requester._id.toString()
    );
    requester.sentRequests = requester.sentRequests.filter(
      id => id.toString() !== currentUser._id.toString()
    );

    // Set both users to bonded
    currentUser.bondStatus = 'bonded';
    requester.bondStatus = 'bonded';

    // Set each other as partners
    currentUser.partner = requester._id;
    requester.partner = currentUser._id;

    await currentUser.save();
    await requester.save();

    res.json({ message: 'Bond accepted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/bond/reject/:userId
// @desc    Reject a bond request
// @access  Private
router.post('/reject/:userId', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.userId);
    const requester = await User.findById(req.params.userId);

    if (!requester) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify that the requester is in current user's receivedRequests
    if (!currentUser.receivedRequests.includes(requester._id)) {
      return res.status(400).json({ error: 'No request from this user' });
    }

    // Remove from request lists
    currentUser.receivedRequests = currentUser.receivedRequests.filter(
      id => id.toString() !== requester._id.toString()
    );
    requester.sentRequests = requester.sentRequests.filter(
      id => id.toString() !== currentUser._id.toString()
    );

    // If the current user had no other pending requests, set bondStatus back to 'none'
    if (currentUser.receivedRequests.length === 0 && currentUser.sentRequests.length === 0) {
      currentUser.bondStatus = 'none';
    }

    // Similarly for requester, if they have no other sent requests, set to 'none'
    if (requester.sentRequests.length === 0 && requester.receivedRequests.length === 0) {
      requester.bondStatus = 'none';
    }

    await currentUser.save();
    await requester.save();

    res.json({ message: 'Request rejected' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;