const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const mongoose = require('mongoose');
const cors = require('cors');   
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ['https://heartlock.vercel.app', 'http://localhost:3000', 'http://localhost:5173'],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// Track online users
const onlineUsers = new Set();

// Middleware
const allowedOrigins = [
  'https://heartlock.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS policy: origin not allowed'));
  },
  credentials: true
}));
app.use(express.json());

// Connect to MongoDB
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGO_URI environment variable is not set');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'photos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    public_id: (req, file) => `photo-${Date.now()}-${Math.round(Math.random() * 1E9)}`,
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Import models and middleware
const Photo = require('./models/Photo');
const User = require('./models/User');
const ChatMessage = require('./models/ChatMessage');
const auth = require('./middleware/auth');
const jwt = require('jsonwebtoken');

// Make io accessible to routes
app.set('socketio', io);

// ========== Socket.io Authentication & Events ==========
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: no token'));
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Invalid token'));
    socket.userId = decoded.userId;
    next();
  });
});

io.on('connection', (socket) => {
  console.log('🔌 New socket connected:', socket.userId);

  // Add to online users and broadcast
  onlineUsers.add(socket.userId);
  io.emit('user-online', socket.userId);

  // Join a room named after the user's own ID
  socket.join(socket.userId);

  // Join a conversation room (room name = sorted pair of user IDs)
  socket.on('join-conversation', ({ partnerId }) => {
    const room = [socket.userId, partnerId].sort().join('-');
    socket.join(room);
    console.log(`User ${socket.userId} joined room ${room}`);
  });

  // Handle sending a message
  socket.on('send-message', async (data) => {
    try {
      const { receiverId, message, replyTo } = data;
      const room = [socket.userId, receiverId].sort().join('-');

      // Save message to database
      const newMessage = new ChatMessage({
        sender: socket.userId,
        receiver: receiverId,
        message,
        replyTo: replyTo || null,
        createdAt: new Date()
      });
      await newMessage.save();

      // Populate sender, receiver, and replyTo for the client
      await newMessage.populate('sender', 'username profilePic');
      await newMessage.populate('receiver', 'username profilePic');
      if (newMessage.replyTo) {
        await newMessage.populate('replyTo', 'message sender');
      }

      // Emit to the conversation room
      io.to(room).emit('new-message', newMessage);
    } catch (err) {
      console.error('Socket send error:', err);
    }
  });

  // Handle typing indicator
  socket.on('typing', ({ partnerId, isTyping }) => {
    socket.to(partnerId).emit('user-typing', { userId: socket.userId, isTyping });
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', socket.userId);
    // Remove from online users and broadcast
    onlineUsers.delete(socket.userId);
    io.emit('user-offline', socket.userId);
  });
});
// =======================================================

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/bond', require('./routes/bond'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/chat', require('./routes/chat'));

// Simple test route
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Upload route – protected, creates a photo post
app.post("/api/upload", auth, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const imageUrl = req.file.path;
    const { caption } = req.body;

    const newPhoto = new Photo({
      user: req.userId,
      imageUrl,
      caption
    });
    await newPhoto.save();

    await newPhoto.populate('user', 'username profilePic');

    res.json({
      success: true,
      photo: newPhoto
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Profile picture upload – does NOT create a Photo document
app.post("/api/users/profile-pic", auth, upload.single("profilePic"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const imageUrl = req.file.path;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    user.profilePic = imageUrl;
    await user.save();

    res.json({ profilePicUrl: imageUrl });
  } catch (error) {
    console.error("Profile pic upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Get all photos (for feed)
app.get("/api/photos", async (req, res) => {
  try {
    const photos = await Photo.find()
      .populate('user', 'username profilePic')
      .sort({ createdAt: -1 });
    res.json(photos);
  } catch (error) {
    console.error("Error fetching photos:", error);
    res.status(500).json({ error: "Could not fetch photos" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});