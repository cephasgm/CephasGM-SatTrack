// =============================================
// CephasGM SatTrack - Satellite Tracking Service
// Calculates visible satellites and optimal tracking
// =============================================

const { 
  getSatellitePosition, 
  calculateAzimuthElevation 
} = require('../utils/orbitalMechanics');
const { getAllSatellites } = require('../config/satellites');

/**
 * Calculate all visible satellites from an observer's position
 * @param {number} observerLat - Observer latitude
 * @param {number} observerLng - Observer longitude
 * @param {number} observerAlt - Observer altitude in meters
 * @param {Date} [date] - Calculation time (defaults to now)
 * @returns {Array} Array of visible satellites with position data
 */
function getVisibleSatellites(observerLat, observerLng, observerAlt, date = new Date()) {
  const allSatellites = getAllSatellites();
  const visibleSatellites = [];

  for (const sat of allSatellites) {
    try {
      let satPosition;

      // Use real orbital mechanics if satellite has TLE data (satrec)
      if (sat.satrec) {
        satPosition = getSatellitePosition(sat.satrec, date);
      } 
      // Use simplified orbital model for fallback satellites
      else if (sat.orbitalParams) {
        satPosition = getSimulatedPosition(sat.orbitalParams, date);
      } else {
        continue;
      }

      if (!satPosition) continue;

      // Calculate azimuth and elevation from observer to satellite
      const azEl = calculateAzimuthElevation(
        observerLat,
        observerLng,
        observerAlt,
        satPosition.latitude,
        satPosition.longitude,
        satPosition.altitude
      );

      if (!azEl) continue;

      // Only include satellites above horizon (elevation > 0)
      if (azEl.visible) {
        visibleSatellites.push({
          id: sat.id,
          name: sat.name,
          norad: sat.norad,
          constellation: sat.constellation,
          latitude: satPosition.latitude,
          longitude: satPosition.longitude,
          altitude: satPosition.altitude,
          velocity: satPosition.velocity,
          azimuth: azEl.azimuth,
          elevation: azEl.elevation,
          range: azEl.range,
          timestamp: satPosition.timestamp
        });
      }
    } catch (error) {
      // Skip satellites that fail to calculate
      continue;
    }
  }

  // Sort by elevation (highest first) - best for tracking
  visibleSatellites.sort((a, b) => b.elevation - a.elevation);

  return visibleSatellites;
}

/**
 * Get the best satellite to track (highest elevation, closest range)
 * @param {number} observerLat - Observer latitude
 * @param {number} observerLng - Observer longitude
 * @param {number} observerAlt - Observer altitude in meters
 * @returns {object|null} Best satellite or null
 */
function getBestSatellite(observerLat, observerLng, observerAlt) {
  const visibleSats = getVisibleSatellites(observerLat, observerLng, observerAlt);
  
  if (visibleSats.length === 0) return null;

  // Score each satellite: higher elevation + closer range = better
  const scored = visibleSats.map(sat => ({
    ...sat,
    score: sat.elevation * 2 + (1000 / Math.max(sat.range, 100))
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored[0];
}

/**
 * Find which satellite the antenna is currently pointing at
 * @param {number} panAngle - Current pan angle
 * @param {number} tiltAngle - Current tilt angle
 * @param {Array} visibleSatellites - List of visible satellites
 * @returns {object|null} Best matching satellite
 */
function findTrackedSatellite(panAngle, tiltAngle, visibleSatellites) {
  if (!visibleSatellites || visibleSatellites.length === 0) return null;

  let bestMatch = null;
  let smallestError = Infinity;

  for (const sat of visibleSatellites) {
    const azError = Math.abs(panAngle - sat.azimuth);
    const elError = Math.abs(tiltAngle - sat.elevation);
    const totalError = Math.sqrt(azError * azError + elError * elError);

    if (totalError < smallestError) {
      smallestError = totalError;
      bestMatch = sat;
    }
  }

  // Only match if within 30 degrees total error
  return smallestError < 30 ? bestMatch : null;
}

/**
 * Simulated position for fallback satellites without real TLE
 */
function getSimulatedPosition(params, date) {
  const { inclination, altitude, period, raan } = params;
  
  // Calculate mean anomaly based on time
  const now = date.getTime() / 1000;
  const meanMotion = (2 * Math.PI) / (period * 60); // radians per second
  const meanAnomaly = (meanMotion * now) % (2 * Math.PI);
  
  // Simplified orbit model
  const latitude = inclination * Math.sin(meanAnomaly);
  const longitude = ((raan + (meanAnomaly * 180 / Math.PI)) % 360) - 180;
  
  return {
    latitude,
    longitude,
    altitude,
    velocity: 7.8,
    timestamp: date.toISOString()
  };
}

module.exports = {
  getVisibleSatellites,
  getBestSatellite,
  findTrackedSatellite
};