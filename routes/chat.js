const express = require('express');
const router = express.Router();
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const auth = require('../middleware/auth');

// @route   GET /api/chat/:userId
// @desc    Get conversation between current user and another user
// @access  Private
router.get('/:userId', auth, async (req, res) => {
  try {
    const otherUser = await User.findById(req.params.userId);
    if (!otherUser) return res.status(404).json({ error: 'User not found' });

    const messages = await ChatMessage.find({
      $or: [
        { sender: req.userId, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.userId }
      ]
    })
      .sort({ createdAt: 1 })
      .populate('sender', 'username profilePic')
      .populate('receiver', 'username profilePic');

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/chat
// @desc    Send a message
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    if (!receiverId || !message || message.trim() === '') {
      return res.status(400).json({ error: 'Receiver and message are required' });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) return res.status(404).json({ error: 'Receiver not found' });

    const newMessage = new ChatMessage({
      sender: req.userId,
      receiver: receiverId,
      message: message.trim(),
      read: false,
      edited: false
    });

    await newMessage.save();
    await newMessage.populate('sender', 'username profilePic');
    await newMessage.populate('receiver', 'username profilePic');

    res.json(newMessage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/chat/conversations/list
// @desc    Get list of users the current user has chatted with (latest message)
// @access  Private
router.get('/conversations/list', auth, async (req, res) => {
  try {
    const messages = await ChatMessage.find({
      $or: [{ sender: req.userId }, { receiver: req.userId }]
    })
      .sort({ createdAt: -1 })
      .populate('sender', 'username profilePic')
      .populate('receiver', 'username profilePic');

    const contactsMap = new Map();
    messages.forEach(msg => {
      const otherUser = msg.sender._id.toString() === req.userId ? msg.receiver : msg.sender;
      if (!contactsMap.has(otherUser._id.toString())) {
        contactsMap.set(otherUser._id.toString(), {
          user: otherUser,
          lastMessage: msg.message,
          lastTime: msg.createdAt,
          unread: !msg.read && msg.receiver._id.toString() === req.userId
        });
      }
    });

    res.json(Array.from(contactsMap.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/chat/read/:senderId
// @desc    Mark all messages from a sender as read
// @access  Private
router.put('/read/:senderId', auth, async (req, res) => {
  try {
    await ChatMessage.updateMany(
      { sender: req.params.senderId, receiver: req.userId, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/chat/:messageId
// @desc    Edit a message (only by sender, within 5 minutes)
// @access  Private
router.put('/:messageId', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const msg = await ChatMessage.findById(req.params.messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    if (msg.sender.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Optional: restrict editing to within 5 minutes
    const now = new Date();
    const msgTime = new Date(msg.createdAt);
    const diffMinutes = (now - msgTime) / (1000 * 60);
    if (diffMinutes > 5) {
      return res.status(400).json({ error: 'Cannot edit messages older than 5 minutes' });
    }

    msg.message = message.trim();
    msg.edited = true;
    await msg.save();

    res.json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/chat/:messageId
// @desc    Unsend/delete a message (only by sender)
// @access  Private
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const msg = await ChatMessage.findById(req.params.messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    if (msg.sender.toString() !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await msg.deleteOne();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/chat/conversation/:userId
// @desc    Delete entire conversation with another user
// @access  Private
router.delete('/conversation/:userId', auth, async (req, res) => {
  try {
    await ChatMessage.deleteMany({
      $or: [
        { sender: req.userId, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.userId }
      ]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;