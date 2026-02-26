const express = require('express');
const router = express.Router();
const Photo = require('../models/Photo');
const auth = require('../middleware/auth');

// @route   GET /api/photos/:id
// @desc    Get a single photo by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id)
      .populate('user', 'username profilePic')
      .populate('comments.user', 'username profilePic');
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    res.json(photo);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/photos/:id/like
// @desc    Toggle like on a photo
// @access  Private
router.post('/:id/like', auth, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const userId = req.userId;
    const liked = photo.likes.includes(userId);

    if (liked) {
      photo.likes = photo.likes.filter(id => id.toString() !== userId.toString());
    } else {
      photo.likes.push(userId);
    }

    await photo.save();
    res.json({ likes: photo.likes.length, liked: !liked });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/photos/:id/comment
// @desc    Add a comment to a photo
// @access  Private
router.post('/:id/comment', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const comment = {
      user: req.userId,
      text: text.trim(),
      createdAt: new Date()
    };

    photo.comments.push(comment);
    await photo.save();

    // Populate the user info for the new comment
    await photo.populate('comments.user', 'username profilePic');
    const newComment = photo.comments[photo.comments.length - 1];
    res.json(newComment);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/photos/:id
// @desc    Delete a photo (only by owner)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    // Ensure the user deleting is the owner
    if (photo.user.toString() !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await photo.deleteOne();
    res.json({ message: 'Photo deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;