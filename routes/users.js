const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Photo = require('../models/Photo');
const auth = require('../middleware/auth');

// @route   GET /api/users/search
// @desc    Search users by username (partial match, case-insensitive)
// @access  Private
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const users = await User.find({
      username: { $regex: q, $options: 'i' }
    })
      .select('username profilePic')
      .limit(10);
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/users/:username/followers
// @desc    Get followers of a user
// @access  Private
router.get('/:username/followers', auth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .populate('followers', 'username profilePic');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.followers);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/users/:username/following
// @desc    Get following of a user
// @access  Private
router.get('/:username/following', auth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .populate('following', 'username profilePic');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.following);
  } catch (err) {
    console.error(err.message);
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
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/users/:username/photos
// @desc    Get all photos by a specific user
// @access  Public
router.get('/:username/photos', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const photos = await Photo.find({ user: user._id })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePic')
      .populate('comments.user', 'username profilePic');

    res.json(photos);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/users/:username/follow
// @desc    Follow a user
// @access  Private
router.post('/:username/follow', auth, async (req, res) => {
  try {
    const userToFollow = await User.findOne({ username: req.params.username });
    if (!userToFollow) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    if (currentUser.username === req.params.username) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    if (currentUser.following.includes(userToFollow._id)) {
      return res.status(400).json({ error: 'Already following this user' });
    }

    currentUser.following.push(userToFollow._id);
    await currentUser.save();

    userToFollow.followers.push(currentUser._id);
    await userToFollow.save();

    res.json({ message: 'Followed successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/users/:username/unfollow
// @desc    Unfollow a user
// @access  Private
router.post('/:username/unfollow', auth, async (req, res) => {
  try {
    const userToUnfollow = await User.findOne({ username: req.params.username });
    if (!userToUnfollow) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'Current user not found' });
    }

    if (currentUser.username === req.params.username) {
      return res.status(400).json({ error: 'You cannot unfollow yourself' });
    }

    if (!currentUser.following.includes(userToUnfollow._id)) {
      return res.status(400).json({ error: 'You are not following this user' });
    }

    currentUser.following = currentUser.following.filter(
      id => id.toString() !== userToUnfollow._id.toString()
    );
    await currentUser.save();

    userToUnfollow.followers = userToUnfollow.followers.filter(
      id => id.toString() !== currentUser._id.toString()
    );
    await userToUnfollow.save();

    res.json({ message: 'Unfollowed successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/users/:username
// @desc    Update user profile (bio, profilePic)
// @access  Private
router.put('/:username', auth, async (req, res) => {
  console.log('PUT /api/users/:username called', {
    params: req.params,
    body: req.body,
    userIdFromToken: req.userId
  });

  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      console.log('User lookup returned null for', req.params.username);
      return res.status(404).json({ error: 'User not found' });
    }

    // Ensure the logged-in user owns this profile
    if (user._id.toString() !== req.userId) {
      console.log('Unauthorized update attempt', { userId: req.userId, ownerId: user._id });
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { bio, profilePic } = req.body;
    if (bio !== undefined) user.bio = bio;
    if (profilePic !== undefined) user.profilePic = profilePic;

    await user.save();

    // Return updated user without password
    const updatedUser = await User.findById(user._id).select('-password');
    res.json(updatedUser);
  } catch (err) {
    console.error('Error in PUT /users/:username', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;