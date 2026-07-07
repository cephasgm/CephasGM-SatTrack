// =============================================
// CephasGM SatTrack - Auth Routes
// Sign in / Sign up API endpoints
// =============================================

const express = require('express');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// In-memory user store (replace with database in production)
const users = [];
const SALT_ROUNDS = 10;

/**
 * POST /api/auth/signup
 * Create a new user account
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName, stationId, stationLocation } = req.body;

    // Validate required fields
    if (!email || !password || !fullName) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Email, password, and full name are required.'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid email format.'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Password must be at least 8 characters.'
      });
    }

    // Check if user already exists
    const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({
        error: 'user_exists',
        message: 'An account with this email already exists.'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const newUser = {
      userId: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      email: email.toLowerCase(),
      password: hashedPassword,
      fullName,
      stationId: stationId || null,
      stationLocation: stationLocation || null,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };

    users.push(newUser);

    console.log(`[Auth] New user registered: ${email} (${newUser.userId})`);

    // Generate token
    const token = generateToken(newUser);

    // Update last login
    newUser.lastLogin = new Date().toISOString();

    // Return success (don't send password back)
    res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: {
        userId: newUser.userId,
        email: newUser.email,
        fullName: newUser.fullName,
        stationId: newUser.stationId,
        stationLocation: newUser.stationLocation,
        createdAt: newUser.createdAt
      }
    });

  } catch (error) {
    console.error('[Auth] Signup error:', error.message);
    res.status(500).json({
      error: 'server_error',
      message: 'An error occurred during sign up. Please try again.'
    });
  }
});

/**
 * POST /api/auth/signin
 * Sign in with email and password
 */
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Email and password are required.'
      });
    }

    // Find user
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return res.status(401).json({
        error: 'invalid_credentials',
        message: 'Invalid email or password.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'invalid_credentials',
        message: 'Invalid email or password.'
      });
    }

    // Update last login
    user.lastLogin = new Date().toISOString();

    // Generate token
    const token = generateToken(user);

    console.log(`[Auth] User signed in: ${email}`);

    // Return success
    res.json({
      message: 'Signed in successfully.',
      token,
      user: {
        userId: user.userId,
        email: user.email,
        fullName: user.fullName,
        stationId: user.stationId,
        stationLocation: user.stationLocation,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    console.error('[Auth] Signin error:', error.message);
    res.status(500).json({
      error: 'server_error',
      message: 'An error occurred during sign in. Please try again.'
    });
  }
});

/**
 * POST /api/auth/google
 * Sign in / Sign up with Google OAuth
 * In production, verify the Google token server-side
 */
router.post('/google', async (req, res) => {
  try {
    const { email, fullName, googleId } = req.body;

    if (!email || !googleId) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Google authentication data is required.'
      });
    }

    // Check if user exists
    let user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      // Create new user from Google data
      user = {
        userId: 'user_google_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        email: email.toLowerCase(),
        password: null, // No password for Google users
        fullName: fullName || 'Google User',
        stationId: null,
        stationLocation: null,
        googleId,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        provider: 'google'
      };
      users.push(user);
      console.log(`[Auth] New Google user: ${email}`);
    } else {
      user.lastLogin = new Date().toISOString();
      if (!user.googleId) user.googleId = googleId;
    }

    // Generate token
    const token = generateToken(user);

    res.json({
      message: 'Google authentication successful.',
      token,
      user: {
        userId: user.userId,
        email: user.email,
        fullName: user.fullName,
        stationId: user.stationId,
        stationLocation: user.stationLocation,
        provider: user.provider || 'google'
      }
    });

  } catch (error) {
    console.error('[Auth] Google auth error:', error.message);
    res.status(500).json({
      error: 'server_error',
      message: 'Google authentication failed.'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile (protected)
 */
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
  const user = users.find(u => u.userId === req.user.userId || u.email === req.user.email);
  
  if (!user) {
    return res.status(404).json({
      error: 'user_not_found',
      message: 'User not found.'
    });
  }

  res.json({
    user: {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      stationId: user.stationId,
      stationLocation: user.stationLocation,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      provider: user.provider || 'email'
    }
  });
});

module.exports = router;