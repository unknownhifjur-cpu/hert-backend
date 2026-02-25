const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const mongoose = require('mongoose');
const cors = require('cors');   
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Configure CORS for production
app.use(cors({ 
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true 
}));  
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
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
const auth = require('./middleware/auth'); // <-- import auth middleware

// Routes
app.use('/api/auth', require('./routes/auth')); // <-- auth routes

// Simple test route
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Upload route – now protected and associates photo with user
app.post("/api/upload", auth, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const imageUrl = req.file.path;
    const { caption } = req.body;

    // Create a new photo with the authenticated user's ID
    const newPhoto = new Photo({
      user: req.userId,      // <-- from auth middleware
      imageUrl,
      caption
    });
    await newPhoto.save();

    // Populate user info before sending response
    await newPhoto.populate('user', 'username avatar');

    res.json({
      success: true,
      photo: newPhoto
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Get all photos (for feed) – now includes user info
app.get("/api/photos", async (req, res) => {
  try {
    const photos = await Photo.find()
      .populate('user', 'username avatar')  // show username and avatar
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
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});