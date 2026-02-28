const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Photo = require('../models/Photo');
const auth = require('../middleware/auth');

// @route   GET /api/users/search
// @desc    Search users by username
// @access  Private
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const users = await User.find({
      username: { $regex: q, $options: 'i' }
    }).select('username profilePic').limit(10);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/users/suggestions
// @desc    Get suggested users (random users, excluding current user)
// @access  Private
router.get('/suggestions', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    // Use aggregation to get random users, projecting only needed fields
    const suggestions = await User.aggregate([
      { $match: { _id: { $ne: currentUserId } } },
      { $sample: { size: 10 } },
      { $project: { username: 1, profilePic: 1 } } // removed fullName – doesn't exist in schema
    ]);

    res.json(suggestions);
  } catch (err) {
    console.error('Error fetching suggestions:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/users/:username
// @desc    Get user profile by username
// @access  Public
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password')
      .populate('followers', 'username profilePic')
      .populate('following', 'username profilePic');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/users/:username/photos
// @desc    Get all photos by a specific user
// @access  Public
router.get('/:username/photos', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const photos = await Photo.find({ user: user._id })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePic')
      .populate('comments.user', 'username profilePic');
    res.json(photos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/users/:username/follow
// @desc    Follow a user
// @access  Private
router.post('/:username/follow', auth, async (req, res) => {
  try {
    const userToFollow = await User.findOne({ username: req.params.username });
    if (!userToFollow) return res.status(404).json({ error: 'User not found' });

    const currentUser = await User.findById(req.user.id);

    // Check if already following
    if (currentUser.following.includes(userToFollow._id)) {
      return res.status(400).json({ error: 'Already following this user' });
    }

    // Add to following array of current user
    currentUser.following.push(userToFollow._id);
    await currentUser.save();

    // Add to followers array of target user
    userToFollow.followers.push(currentUser._id);
    await userToFollow.save();

    // Optionally create a notification (if you have a Notification model)
    // const Notification = require('../models/Notification');
    // await Notification.create({
    //   recipient: userToFollow._id,
    //   sender: currentUser._id,
    //   type: 'follow'
    // });

    res.json({ message: 'Followed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/users/:username/unfollow
// @desc    Unfollow a user
// @access  Private
router.post('/:username/unfollow', auth, async (req, res) => {
  try {
    const userToUnfollow = await User.findOne({ username: req.params.username });
    if (!userToUnfollow) return res.status(404).json({ error: 'User not found' });

    const currentUser = await User.findById(req.user.id);

    // Check if actually following
    if (!currentUser.following.includes(userToUnfollow._id)) {
      return res.status(400).json({ error: 'Not following this user' });
    }

    // Remove from following array
    currentUser.following = currentUser.following.filter(
      id => id.toString() !== userToUnfollow._id.toString()
    );
    await currentUser.save();

    // Remove from followers array
    userToUnfollow.followers = userToUnfollow.followers.filter(
      id => id.toString() !== currentUser._id.toString()
    );
    await userToUnfollow.save();

    res.json({ message: 'Unfollowed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/users/:username
// @desc    Update user profile (bio, profilePic)
// @access  Private
router.put('/:username', auth, async (req, res) => {
  try {
    // Ensure the authenticated user is updating their own profile
    const user = await User.findById(req.user.id);
    if (user.username !== req.params.username) {
      return res.status(403).json({ error: 'You can only update your own profile' });
    }

    const { bio, profilePic } = req.body; // removed fullName – not in schema

    // Update fields if provided
    if (bio !== undefined) user.bio = bio;
    if (profilePic !== undefined) user.profilePic = profilePic;

    await user.save();

    // Return updated user without password
    const updatedUser = await User.findById(user._id).select('-password');
    res.json(updatedUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;