// =============================================
// CephasGM SatTrack - Authentication Middleware
// JWT token verification for protected routes
// =============================================

const jwt = require('jsonwebtoken');

/**
 * Verify JWT token from Authorization header
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Access token is required. Please sign in.'
    });
  }

  try {
    const secret = process.env.JWT_SECRET || 'cephasgm_sattrack_secret_key_2025';
    const decoded = jwt.verify(token, secret);
    
    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      fullName: decoded.fullName,
      stationId: decoded.stationId
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'token_expired',
        message: 'Token has expired. Please sign in again.'
      });
    }
    
    return res.status(403).json({
      error: 'invalid_token',
      message: 'Invalid or malformed token.'
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 * Attaches user if token is valid, continues anyway
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const secret = process.env.JWT_SECRET || 'cephasgm_sattrack_secret_key_2025';
      const decoded = jwt.verify(token, secret);
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        fullName: decoded.fullName,
        stationId: decoded.stationId
      };
    } catch (error) {
      // Token invalid, but we don't block the request
      req.user = null;
    }
  }

  next();
}

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
  const secret = process.env.JWT_SECRET || 'cephasgm_sattrack_secret_key_2025';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(
    {
      userId: user.userId || user.email,
      email: user.email,
      fullName: user.fullName,
      stationId: user.stationId || null
    },
    secret,
    { expiresIn }
  );
}

module.exports = {
  authenticateToken,
  optionalAuth,
  generateToken
};