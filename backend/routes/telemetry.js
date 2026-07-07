// =============================================
// CephasGM SatTrack - Telemetry Routes
// Receives data from ESP32 ground terminal
// =============================================

const express = require('express');
const router = express.Router();
const telemetryService = require('../services/telemetryService');
const satelliteService = require('../services/satelliteService');
const websocketService = require('../services/websocketService');

/**
 * POST /api/telemetry
 * Receives telemetry from ESP32 terminal
 * Body: { deviceId, lat, lng, alt, pan, tilt, roll?, pitch?, yaw? }
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
    if (!data.deviceId) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'deviceId is required.'
      });
    }

    if (data.lat === undefined || data.lng === undefined) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'GPS coordinates (lat, lng) are required.'
      });
    }

    // Process and store telemetry
    const telemetry = telemetryService.processTelemetry(data);

    // Calculate visible satellites from terminal location
    const visibleSatellites = satelliteService.getVisibleSatellites(
      telemetry.lat,
      telemetry.lng,
      telemetry.alt
    );

    // Find the best satellite to track
    const bestSatellite = satelliteService.getBestSatellite(
      telemetry.lat,
      telemetry.lng,
      telemetry.alt
    );

    // Enrich telemetry with satellite data
    const enriched = telemetryService.enrichTelemetry(telemetry, bestSatellite);

    // Add visible satellites list
    enriched.satellites = visibleSatellites.slice(0, 15);
    enriched.visibleCount = visibleSatellites.length;

    // Add best satellite tracking data
    if (bestSatellite) {
      enriched.recommendedAz = bestSatellite.azimuth;
      enriched.recommendedEl = bestSatellite.elevation;
    }

    // Broadcast to all WebSocket clients
    const broadcastCount = websocketService.broadcastTelemetry(enriched);

    console.log(
      `[Telemetry] Device: ${data.deviceId} | ` +
      `GPS: ${telemetry.lat?.toFixed(4)}, ${telemetry.lng?.toFixed(4)} | ` +
      `Sats: ${visibleSatellites.length} | ` +
      `Best: ${bestSatellite?.name || 'none'} | ` +
      `Signal: ${enriched.signalStrength}% | ` +
      `Broadcast: ${broadcastCount} clients`
    );

    // Return response to ESP32
    res.json({
      received: true,
      timestamp: telemetry.timestamp,
      visibleSatellites: visibleSatellites.length,
      bestSatellite: bestSatellite ? {
        id: bestSatellite.id,
        name: bestSatellite.name,
        azimuth: bestSatellite.azimuth,
        elevation: bestSatellite.elevation
      } : null,
      recommendedPan: bestSatellite?.azimuth || null,
      recommendedTilt: bestSatellite?.elevation || null,
      signalStrength: enriched.signalStrength,
      linkStatus: enriched.linkStatus
    });

  } catch (error) {
    console.error('[Telemetry] Error processing telemetry:', error.message);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to process telemetry data.'
    });
  }
});

/**
 * GET /api/telemetry/latest
 * Get the latest telemetry data
 */
router.get('/latest', (req, res) => {
  const latest = telemetryService.getLatestTelemetry();

  if (!latest) {
    return res.json({
      hasData: false,
      message: 'No telemetry data received yet. Waiting for terminal connection.'
    });
  }

  // Recalculate satellites for latest position
  const visibleSatellites = satelliteService.getVisibleSatellites(
    latest.lat,
    latest.lng,
    latest.alt
  );

  const bestSatellite = satelliteService.getBestSatellite(
    latest.lat,
    latest.lng,
    latest.alt
  );

  const enriched = telemetryService.enrichTelemetry(latest, bestSatellite);
  enriched.satellites = visibleSatellites.slice(0, 15);
  enriched.visibleCount = visibleSatellites.length;

  res.json(enriched);
});

/**
 * GET /api/telemetry/history
 * Get telemetry history
 * Query params: limit (default 50)
 */
router.get('/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const history = telemetryService.getTelemetryHistory(Math.min(limit, 500));

  res.json({
    count: history.length,
    history
  });
});

/**
 * GET /api/telemetry/stats
 * Get telemetry statistics
 */
router.get('/stats', (req, res) => {
  const stats = telemetryService.getTelemetryStats();
  const clientsCount = websocketService.getConnectedClientsCount();

  res.json({
    ...stats,
    connectedClients: clientsCount
  });
});

module.exports = router;