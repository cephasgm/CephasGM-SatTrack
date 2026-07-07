// =============================================
// CephasGM SatTrack - Orbital Mechanics Engine
// Real satellite position calculations using TLE data
// =============================================

const satellite = require('satellite.js');

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
function toDegrees(radians) {
  return radians * (180 / Math.PI);
}

/**
 * Parse TLE lines into a satellite record
 * @param {string} tleLine1 - TLE line 1
 * @param {string} tleLine2 - TLE line 2
 * @returns {object} Parsed satellite record
 */
function parseTLE(tleLine1, tleLine2) {
  try {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    return satrec;
  } catch (error) {
    console.error('TLE parse error:', error.message);
    return null;
  }
}

/**
 * Calculate satellite position (ECI coordinates) at a given time
 * @param {object} satrec - Satellite record from TLE
 * @param {Date} date - Date object for calculation
 * @returns {object} Position {x, y, z} in kilometers and velocity {vx, vy, vz} in km/s
 */
function getSatellitePosition(satrec, date = new Date()) {
  try {
    const gmst = satellite.gstime(date);
    const positionAndVelocity = satellite.propagate(satrec, date);
    
    if (!positionAndVelocity || !positionAndVelocity.position) {
      return null;
    }

    const positionEci = positionAndVelocity.position;
    const velocityEci = positionAndVelocity.velocity;

    // Convert ECI to Geodetic (latitude, longitude, altitude)
    const gmstRad = gmst;
    const longitude = toDegrees(
      Math.atan2(positionEci.y, positionEci.x) - gmstRad
    );
    const latitude = toDegrees(
      Math.atan2(
        positionEci.z,
        Math.sqrt(positionEci.x * positionEci.x + positionEci.y * positionEci.y)
      )
    );
    
    // Normalize longitude to -180 to 180
    const normalizedLng = ((longitude + 180) % 360 + 360) % 360 - 180;
    
    // Calculate altitude (distance from Earth's center minus Earth's radius)
    const distance = Math.sqrt(
      positionEci.x * positionEci.x +
      positionEci.y * positionEci.y +
      positionEci.z * positionEci.z
    );
    const altitude = distance - 6371; // Earth's radius in km

    // Calculate velocity magnitude in km/s
    const velocity = Math.sqrt(
      velocityEci.x * velocityEci.x +
      velocityEci.y * velocityEci.y +
      velocityEci.z * velocityEci.z
    );

    return {
      latitude,
      longitude: normalizedLng,
      altitude,
      velocity,
      position: {
        x: positionEci.x,
        y: positionEci.y,
        z: positionEci.z
      },
      timestamp: date.toISOString()
    };
  } catch (error) {
    console.error('Position calculation error:', error.message);
    return null;
  }
}

/**
 * Calculate azimuth and elevation from observer to satellite
 * @param {number} observerLat - Observer latitude in degrees
 * @param {number} observerLng - Observer longitude in degrees
 * @param {number} observerAlt - Observer altitude in meters
 * @param {number} satLat - Satellite latitude in degrees
 * @param {number} satLng - Satellite longitude in degrees
 * @param {number} satAlt - Satellite altitude in kilometers
 * @returns {object} { azimuth, elevation, range }
 */
function calculateAzimuthElevation(observerLat, observerLng, observerAlt, satLat, satLng, satAlt) {
  try {
    // Convert all to radians
    const lat1 = toRadians(observerLat);
    const lng1 = toRadians(observerLng);
    const lat2 = toRadians(satLat);
    const lng2 = toRadians(satLng);
    
    // Earth radius at observer location + observer altitude
    const R = 6371 + (observerAlt / 1000); // km
    
    // Satellite distance from Earth center
    const Rs = 6371 + satAlt; // km
    
    // Calculate angular distance using great circle formula
    const deltaLng = lng2 - lng1;
    const centralAngle = Math.acos(
      Math.sin(lat1) * Math.sin(lat2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.cos(deltaLng)
    );
    
    // Calculate slant range (distance from observer to satellite)
    const slantRange = Math.sqrt(
      R * R + Rs * Rs - 2 * R * Rs * Math.cos(centralAngle)
    );
    
    // Calculate elevation angle
    const elevation = Math.asin(
      (Rs * Rs - R * R - slantRange * slantRange) / (-2 * R * slantRange)
    );
    
    // Calculate azimuth
    const azimuthAngle = Math.atan2(
      Math.sin(deltaLng) * Math.cos(lat2),
      Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)
    );
    
    const azimuth = ((toDegrees(azimuthAngle) + 360) % 360);
    const elevationDeg = toDegrees(elevation);
    
    return {
      azimuth: Math.round(azimuth * 10) / 10,
      elevation: Math.round(elevationDeg * 10) / 10,
      range: Math.round(slantRange * 10) / 10,
      visible: elevationDeg > 0
    };
  } catch (error) {
    console.error('Azimuth/Elevation calculation error:', error.message);
    return null;
  }
}

/**
 * Calculate signal strength based on angular alignment
 * @param {number} panAngle - Antenna pan angle (degrees)
 * @param {number} tiltAngle - Antenna tilt angle (degrees)
 * @param {number} targetAzimuth - Satellite azimuth (degrees)
 * @param {number} targetElevation - Satellite elevation (degrees)
 * @returns {number} Signal strength 0-100
 */
function calculateSignalStrength(panAngle, tiltAngle, targetAzimuth, targetElevation) {
  // Angular error in degrees
  const azError = Math.abs(panAngle - targetAzimuth);
  const elError = Math.abs(tiltAngle - targetElevation);
  
  // Total angular distance (Euclidean)
  const angularError = Math.sqrt(azError * azError + elError * elError);
  
  // Signal strength formula: 100% when perfectly aligned, decreases with angular error
  // -3dB beamwidth approx 10 degrees for a patch antenna
  const beamwidth = 10; // degrees for half-power (-3dB)
  const signalStrength = 100 * Math.exp(-angularError * angularError / (2 * beamwidth * beamwidth));
  
  return Math.max(0, Math.min(100, Math.round(signalStrength * 10) / 10));
}

/**
 * Calculate latency based on distance
 * @param {number} range - Slant range in kilometers
 * @returns {number} Latency in milliseconds (round trip)
 */
function calculateLatency(range) {
  const speedOfLight = 299792.458; // km/s
  const oneWayLatency = (range / speedOfLight) * 1000; // ms
  const roundTrip = oneWayLatency * 2;
  const processingDelay = 5; // ms for satellite processing
  
  return Math.round(roundTrip + processingDelay);
}

/**
 * Calculate doppler shift
 * @param {number} relativeVelocity - Relative velocity in km/s
 * @param {number} frequency - Transmission frequency in GHz
 * @returns {number} Doppler shift in kHz
 */
function calculateDopplerShift(relativeVelocity, frequency = 12) {
  const speedOfLight = 299792.458; // km/s
  const dopplerShift = (relativeVelocity / speedOfLight) * frequency * 1e6; // kHz
  return Math.round(dopplerShift * 100) / 100;
}

module.exports = {
  parseTLE,
  getSatellitePosition,
  calculateAzimuthElevation,
  calculateSignalStrength,
  calculateLatency,
  calculateDopplerShift,
  toRadians,
  toDegrees
};