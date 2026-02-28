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

// @route   GET /api/users/saved/photos
// @desc    Get saved photos for the current user
// @access  Private
router.get('/saved/photos', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate({
        path: 'savedPhotos',
        populate: { 
          path: 'user', 
          select: 'username profilePic' 
        }
      });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user.savedPhotos || []);
  } catch (err) {
    console.error('Error fetching saved photos:', err);
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

    if (userToFollow._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    if (!currentUser.following.includes(userToFollow._id)) {
      currentUser.following.push(userToFollow._id);
      userToFollow.followers.push(currentUser._id);
      await currentUser.save();
      await userToFollow.save();
    }

    // Return updated user data
    const updatedUser = await User.findOne({ username: req.params.username })
      .select('-password')
      .populate('followers', 'username profilePic')
      .populate('following', 'username profilePic');

    res.json(updatedUser);
  } catch (err) {
    console.error('Follow error:', err);
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

    currentUser.following = currentUser.following.filter(
      id => id.toString() !== userToUnfollow._id.toString()
    );
    userToUnfollow.followers = userToUnfollow.followers.filter(
      id => id.toString() !== currentUser._id.toString()
    );

    await currentUser.save();
    await userToUnfollow.save();

    // Return updated user data
    const updatedUser = await User.findOne({ username: req.params.username })
      .select('-password')
      .populate('followers', 'username profilePic')
      .populate('following', 'username profilePic');

    res.json(updatedUser);
  } catch (err) {
    console.error('Unfollow error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/users/:username
// @desc    Update user profile (bio, profilePic)
// @access  Private
router.put('/:username', auth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check if the authenticated user is the owner
    if (user._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { bio, profilePic } = req.body;
    if (bio !== undefined) user.bio = bio;
    if (profilePic !== undefined) user.profilePic = profilePic;

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('followers', 'username profilePic')
      .populate('following', 'username profilePic');

    res.json(updatedUser);
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;