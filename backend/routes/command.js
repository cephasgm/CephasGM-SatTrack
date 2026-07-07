// =============================================
// CephasGM SatTrack - Command Routes
// Sends antenna commands to ESP32 terminal
// =============================================

const express = require('express');
const router = express.Router();
const websocketService = require('../services/websocketService');
const telemetryService = require('../services/telemetryService');
const satelliteService = require('../services/satelliteService');

// Store pending commands for ESP32 to fetch
const pendingCommands = new Map();
const COMMAND_EXPIRY = 30000; // 30 seconds

/**
 * POST /api/command
 * Send a command to the terminal (via WebSocket or polling)
 * Body: { deviceId, pan, tilt, mode }
 */
router.post('/', (req, res) => {
  try {
    const { deviceId, pan, tilt, mode } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'deviceId is required.'
      });
    }

    // Build command
    const command = {
      deviceId,
      type: 'command',
      pan: pan !== undefined ? parseInt(pan) : null,
      tilt: tilt !== undefined ? parseInt(tilt) : null,
      mode: mode || 'manual', // manual, auto, scan
      timestamp: new Date().toISOString(),
      expiresAt: Date.now() + COMMAND_EXPIRY
    };

    // Validate angles
    if (command.pan !== null && (command.pan < 0 || command.pan > 180)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Pan angle must be between 0 and 180 degrees.'
      });
    }

    if (command.tilt !== null && (command.tilt < 0 || command.tilt > 90)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Tilt angle must be between 0 and 90 degrees.'
      });
    }

    // Store pending command for ESP32 to poll
    pendingCommands.set(deviceId, command);

    // Auto-expire old commands
    setTimeout(() => {
      const stored = pendingCommands.get(deviceId);
      if (stored && stored.timestamp === command.timestamp) {
        pendingCommands.delete(deviceId);
      }
    }, COMMAND_EXPIRY);

    // Also broadcast via WebSocket for real-time
    websocketService.broadcastCommand(command);

    console.log(
      `[Command] Sent to ${deviceId}: ` +
      `pan=${command.pan}°, tilt=${command.tilt}°, mode=${command.mode}`
    );

    res.json({
      sent: true,
      command,
      message: 'Command sent successfully.'
    });

  } catch (error) {
    console.error('[Command] Error sending command:', error.message);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to send command.'
    });
  }
});

/**
 * GET /api/command/:deviceId
 * ESP32 polls this to get pending commands
 */
router.get('/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const command = pendingCommands.get(deviceId);

  if (command && command.expiresAt > Date.now()) {
    // Remove after delivery
    pendingCommands.delete(deviceId);
    res.json({
      hasCommand: true,
      command
    });
  } else {
    // Clean up expired
    if (command) pendingCommands.delete(deviceId);

    res.json({
      hasCommand: false,
      message: 'No pending commands.'
    });
  }
});

/**
 * POST /api/command/auto-track
 * Enable auto-tracking - terminal follows best satellite automatically
 * Body: { deviceId, enabled }
 */
router.post('/auto-track', (req, res) => {
  try {
    const { deviceId, enabled } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'deviceId is required.'
      });
    }

    const latest = telemetryService.getLatestTelemetry();

    // Get current best satellite if telemetry exists
    let bestSatellite = null;
    if (latest && latest.lat && latest.lng) {
      bestSatellite = satelliteService.getBestSatellite(
        latest.lat,
        latest.lng,
        latest.alt
      );
    }

    const command = {
      deviceId,
      type: 'autoTrack',
      enabled: enabled === true || enabled === 'true',
      recommendedPan: bestSatellite?.azimuth || null,
      recommendedTilt: bestSatellite?.elevation || null,
      bestSatellite: bestSatellite?.name || null,
      timestamp: new Date().toISOString()
    };

    // Store and broadcast
    pendingCommands.set(deviceId, {
      ...command,
      type: 'command',
      mode: command.enabled ? 'auto' : 'manual',
      pan: command.recommendedPan,
      tilt: command.recommendedTilt,
      expiresAt: Date.now() + COMMAND_EXPIRY
    });

    websocketService.broadcastCommand(command);

    console.log(
      `[Command] Auto-track ${command.enabled ? 'ENABLED' : 'DISABLED'} ` +
      `for ${deviceId} | Target: ${bestSatellite?.name || 'none'}`
    );

    res.json({
      sent: true,
      autoTrack: command.enabled,
      recommendedPan: command.recommendedPan,
      recommendedTilt: command.recommendedTilt,
      bestSatellite: command.bestSatellite
    });

  } catch (error) {
    console.error('[Command] Auto-track error:', error.message);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to toggle auto-track.'
    });
  }
});

/**
 * GET /api/command/status/:deviceId
 * Check if there are pending commands for a device
 */
router.get('/status/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const command = pendingCommands.get(deviceId);
  const hasPending = command && command.expiresAt > Date.now();

  res.json({
    deviceId,
    hasPendingCommand: hasPending,
    pendingCommand: hasPending ? command : null
  });
});

module.exports = router;