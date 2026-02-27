const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const User = require('../models/User');
const ChatMessage = require('../models/ChatMessage');
const auth = require('../middleware/auth');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Make sure this is set in your .env
});

// @route   POST /api/ai/chat
// @desc    Send message to OpenAI and get response
// @access  Private
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, aiUserId } = req.body;
    if (!message || !aiUserId) {
      return res.status(400).json({ error: 'Message and AI user ID required' });
    }

    // Get recent conversation history for context (last 10 messages)
    const previousMessages = await ChatMessage.find({
      $or: [
        { sender: req.userId, receiver: aiUserId },
        { sender: aiUserId, receiver: req.userId }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(10);

    // Store user message
    const userMessage = new ChatMessage({
      sender: req.userId,
      receiver: aiUserId,
      message: message.trim(),
      read: true,
    });
    await userMessage.save();

    // Prepare conversation history for OpenAI format
    const messagesForAI = previousMessages.reverse().map(msg => ({
      role: msg.sender.toString() === aiUserId ? 'assistant' : 'user',
      content: msg.message,
    }));
    // Add the new user message
    messagesForAI.push({ role: 'user', content: message });

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // or 'gpt-4' if you have access
      messages: messagesForAI,
      max_tokens: 200,
      temperature: 0.7,
    });

    const aiReply = completion.choices[0].message.content;

    // Store AI response
    const aiMessage = new ChatMessage({
      sender: aiUserId,
      receiver: req.userId,
      message: aiReply,
      read: false,
    });
    await aiMessage.save();

    res.json({
      userMessage,
      aiMessage,
    });

  } catch (err) {
    console.error('AI chat error:', err);
    
    // Handle rate limit or quota errors
    if (err.status === 429 || (err.message && err.message.includes('quota'))) {
      return res.status(429).json({ 
        error: 'OpenAI rate limit or quota exceeded. Please try again later.',
        limitExceeded: true 
      });
    }
    
    res.status(500).json({ error: 'AI chat failed' });
  }
});

// @route   GET /api/ai/info
// @desc    Get AI user details (or create if not exists)
// @access  Private
router.get('/info', auth, async (req, res) => {
  try {
    let aiUser = await User.findOne({ email: 'ai@heartlock.com' });
    
    if (!aiUser) {
      // Create AI user if it doesn't exist
      aiUser = new User({
        username: 'AI Assistant',
        email: 'ai@heartlock.com',
        password: 'dummy_password_not_used', // won't be used for login
        profilePic: null,
        bio: 'Your AI assistant powered by OpenAI. Ask me anything!',
      });
      await aiUser.save();
    }
    
    res.json({
      _id: aiUser._id,
      username: aiUser.username,
      profilePic: aiUser.profilePic,
      bio: aiUser.bio
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;