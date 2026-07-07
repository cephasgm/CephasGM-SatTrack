// =============================================
// CephasGM SatTrack - Telemetry Service
// Processes, stores, and manages terminal telemetry
// =============================================

const { calculateSignalStrength, calculateLatency } = require('../utils/orbitalMechanics');

// In-memory telemetry store
const telemetryStore = {
  latest: null,
  history: [],
  maxHistory: 500,
  connectedSince: null,
  totalUpdates: 0,
  lastUpdate: null
};

/**
 * Process incoming telemetry data from ESP32 terminal
 * @param {object} data - Raw telemetry from device
 * @param {string} data.deviceId - Device identifier
 * @param {number} data.lat - GPS latitude
 * @param {number} data.lng - GPS longitude
 * @param {number} data.alt - GPS altitude
 * @param {number} data.pan - Antenna pan angle
 * @param {number} data.tilt - Antenna tilt angle
 * @param {number} [data.roll] - IMU roll
 * @param {number} [data.pitch] - IMU pitch
 * @param {number} [data.yaw] - IMU yaw
 * @returns {object} Processed telemetry
 */
function processTelemetry(data) {
  const timestamp = new Date().toISOString();
  
  const processed = {
    deviceId: data.deviceId || 'terminal-001',
    lat: parseFloat(data.lat) || null,
    lng: parseFloat(data.lng) || null,
    alt: parseFloat(data.alt) || 0,
    pan: parseFloat(data.pan) || 90,
    tilt: parseFloat(data.tilt) || 45,
    roll: parseFloat(data.roll) || 0,
    pitch: parseFloat(data.pitch) || 0,
    yaw: parseFloat(data.yaw) || 0,
    timestamp,
    receivedAt: Date.now()
  };

  // Update store
  telemetryStore.latest = processed;
  telemetryStore.lastUpdate = timestamp;
  telemetryStore.totalUpdates++;

  if (!telemetryStore.connectedSince) {
    telemetryStore.connectedSince = timestamp;
  }

  // Add to history
  telemetryStore.history.push(processed);
  
  // Trim history if too large
  if (telemetryStore.history.length > telemetryStore.maxHistory) {
    telemetryStore.history = telemetryStore.history.slice(-telemetryStore.maxHistory);
  }

  return processed;
}

/**
 * Enrich telemetry with satellite tracking calculations
 * @param {object} telemetry - Processed telemetry
 * @param {object} trackedSatellite - Satellite being tracked
 * @returns {object} Enriched telemetry for dashboard
 */
function enrichTelemetry(telemetry, trackedSatellite) {
  if (!telemetry) return null;

  const enriched = { ...telemetry };

  if (trackedSatellite) {
    // Calculate signal strength based on antenna alignment
    enriched.signalStrength = calculateSignalStrength(
      telemetry.pan,
      telemetry.tilt,
      trackedSatellite.azimuth || 0,
      trackedSatellite.elevation || 0
    );

    // Calculate latency
    enriched.latency = calculateLatency(trackedSatellite.range || 500);

    // Satellite info
    enriched.satelliteId = trackedSatellite.id;
    enriched.satelliteName = trackedSatellite.name;
    enriched.satelliteAz = trackedSatellite.azimuth;
    enriched.satelliteEl = trackedSatellite.elevation;
    enriched.satelliteRange = trackedSatellite.range;
    enriched.satelliteLat = trackedSatellite.latitude;
    enriched.satelliteLng = trackedSatellite.longitude;
    enriched.satelliteAlt = trackedSatellite.altitude;

    // Link status
    enriched.linkStatus = enriched.signalStrength > 30 ? 'Connected' : 
                          enriched.signalStrength > 10 ? 'Weak Signal' : 'Searching';
  } else {
    enriched.signalStrength = 0;
    enriched.latency = null;
    enriched.satelliteId = null;
    enriched.satelliteName = null;
    enriched.linkStatus = 'No Satellite';
  }

  // Count visible satellites (added by satellite service)
  enriched.visibleCount = telemetry.visibleCount || 0;
  enriched.satellites = telemetry.satellites || [];

  return enriched;
}

/**
 * Get latest telemetry
 */
function getLatestTelemetry() {
  return telemetryStore.latest;
}

/**
 * Get telemetry history
 * @param {number} limit - Number of records to return
 */
function getTelemetryHistory(limit = 50) {
  return telemetryStore.history.slice(-limit);
}

/**
 * Get telemetry stats
 */
function getTelemetryStats() {
  return {
    connectedSince: telemetryStore.connectedSince,
    totalUpdates: telemetryStore.totalUpdates,
    lastUpdate: telemetryStore.lastUpdate,
    hasData: telemetryStore.latest !== null
  };
}

/**
 * Clear telemetry data
 */
function clearTelemetry() {
  telemetryStore.latest = null;
  telemetryStore.history = [];
  telemetryStore.connectedSince = null;
  telemetryStore.totalUpdates = 0;
  telemetryStore.lastUpdate = null;
}

module.exports = {
  processTelemetry,
  enrichTelemetry,
  getLatestTelemetry,
  getTelemetryHistory,
  getTelemetryStats,
  clearTelemetry
};