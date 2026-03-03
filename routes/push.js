const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const PushSubscription = require('../models/PushSubscription');
const webpush = require('web-push');

// Set VAPID details
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// @route   POST /api/push/subscribe
// @desc    Save a new push subscription
// @access  Private
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    // Remove any old subscription with the same endpoint
    await PushSubscription.deleteMany({ endpoint });
    const subscription = new PushSubscription({
      user: req.userId,
      endpoint,
      keys
    });
    await subscription.save();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/push/unsubscribe
// @desc    Remove a push subscription (when user logs out or disables)
// @access  Private
router.delete('/unsubscribe', auth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    await PushSubscription.deleteMany({ endpoint, user: req.userId });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;