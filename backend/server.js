// =============================================
// CephasGM SatTrack - Main Server
// Ground Terminal Backend - Express + WebSocket
// =============================================

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

// Import services
const { initializeWebSocket, getConnectedClientsCount } = require('./services/websocketService');
const { initializeConstellation } = require('./config/satellites');
const telemetryService = require('./services/telemetryService');
const satelliteService = require('./services/satelliteService');
const websocketService = require('./services/websocketService');

// Import routes
const authRoutes = require('./routes/auth');
const telemetryRoutes = require('./routes/telemetry');
const commandRoutes = require('./routes/command');

// =============================================
// Configuration
// =============================================
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// =============================================
// Initialize Express
// =============================================
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/favicon.ico') {
      console.log(
        `[HTTP] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`
      );
    }
  });
  next();
});

// =============================================
// Routes
// =============================================

// Health check
app.get('/api/health', (req, res) => {
  const stats = telemetryService.getTelemetryStats();
  res.json({
    status: 'online',
    service: 'CephasGM SatTrack Backend',
    version: '1.0.0',
    environment: NODE_ENV,
    uptime: Math.floor(process.uptime()),
    connectedClients: getConnectedClientsCount(),
    telemetry: {
      hasData: stats.hasData,
      totalUpdates: stats.totalUpdates,
      lastUpdate: stats.lastUpdate
    },
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/command', commandRoutes);

// Serve static frontend (if deployed together)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Fallback for SPA
app.get('*', (req, res) => {
  // Only serve index for non-API routes
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(__dirname, '..', 'frontend', 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(404).json({
          error: 'not_found',
          message: 'Resource not found.'
        });
      }
    });
  } else {
    res.status(404).json({
      error: 'not_found',
      message: 'API endpoint not found.'
    });
  }
});

// =============================================
// Error Handling
// =============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `Route ${req.method} ${req.path} not found.`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.stack);
  res.status(500).json({
    error: 'server_error',
    message: NODE_ENV === 'production' 
      ? 'An unexpected error occurred.' 
      : err.message
  });
});

// =============================================
// Initialize WebSocket
// =============================================
initializeWebSocket(server);

// =============================================
// Initialize Satellite Constellation
// =============================================
console.log('[Server] Loading satellite constellation...');
const satelliteCount = initializeConstellation().length;
console.log(`[Server] Constellation ready: ${satelliteCount} satellites`);

// =============================================
// Start Server
// =============================================
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     🛰️  CephasGM SatTrack Backend         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Environment : ${NODE_ENV.padEnd(30)}║`);
  console.log(`║  HTTP Server : http://localhost:${PORT.toString().padEnd(21)}║`);
  console.log(`║  WebSocket   : ws://localhost:${PORT.toString().padEnd(22)}║`);
  console.log(`║  Satellites  : ${satelliteCount.toString().padEnd(30)}║`);
  console.log(`║  CORS Origin : ${CORS_ORIGIN.padEnd(30)}║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('📡 Waiting for ground terminal connection...');
  console.log('🌍 Open dashboard to monitor satellite passes');
  console.log('');
});

// =============================================
// Graceful Shutdown
// =============================================
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('\n[Server] Shutting down gracefully...');
  
  websocketService.shutdown();
  
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

module.exports = { app, server };