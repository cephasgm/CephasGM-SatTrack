// =============================================
// CephasGM SatTrack - Satellite Constellation Config
// Loads TLE data and initializes satellite models
// =============================================

const fs = require('fs');
const path = require('path');
const { parseTLE } = require('../utils/orbitalMechanics');

// Load TLE data
const tleDataPath = path.join(__dirname, '..', 'data', 'tle.json');
let satelliteDatabase = [];
let tleCache = {};

/**
 * Initialize satellite constellation from TLE data file
 */
function initializeConstellation() {
  try {
    const rawData = fs.readFileSync(tleDataPath, 'utf8');
    const tleData = JSON.parse(rawData);
    
    satelliteDatabase = [];
    tleCache = {};
    
    for (const sat of tleData.satellites) {
      const satrec = parseTLE(sat.tle_line1, sat.tle_line2);
      
      if (satrec) {
        const satelliteEntry = {
          id: sat.id,
          name: sat.name,
          norad: sat.norad,
          satrec: satrec,
          tle_line1: sat.tle_line1,
          tle_line2: sat.tle_line2,
          constellation: sat.id.startsWith('STARLINK') ? 'Starlink' : 
                         sat.id.startsWith('ONEWEB') ? 'OneWeb' : 
                         sat.id === 'ISS' ? 'ISS' : 'Other',
          orbitType: sat.name.includes('ISS') ? 'LEO' : 'LEO',
          status: 'active'
        };
        
        satelliteDatabase.push(satelliteEntry);
        tleCache[sat.id] = satelliteEntry;
      }
    }
    
    console.log(`[Satellites] Constellation initialized: ${satelliteDatabase.length} satellites loaded`);
    return satelliteDatabase;
  } catch (error) {
    console.error('[Satellites] Failed to load TLE data:', error.message);
    // Fallback: create some basic satellites if TLE file is missing
    return createFallbackConstellation();
  }
}

/**
 * Create minimal fallback constellation if TLE file is unavailable
 */
function createFallbackConstellation() {
  console.warn('[Satellites] Using fallback constellation data');
  
  const fallbackSats = [
    {
      id: 'STARLINK-FALLBACK-1',
      name: 'Starlink (Sim)',
      norad: '99991',
      constellation: 'Starlink',
      orbitType: 'LEO',
      status: 'simulated',
      orbitalParams: {
        inclination: 53,
        altitude: 550,
        period: 95.6,
        raan: 0
      }
    },
    {
      id: 'ISS-FALLBACK',
      name: 'ISS (Sim)',
      norad: '99992',
      constellation: 'ISS',
      orbitType: 'LEO',
      status: 'simulated',
      orbitalParams: {
        inclination: 51.6,
        altitude: 420,
        period: 92.7,
        raan: 60
      }
    }
  ];
  
  satelliteDatabase = fallbackSats;
  return satelliteDatabase;
}

/**
 * Get all satellites in the constellation
 */
function getAllSatellites() {
  if (satelliteDatabase.length === 0) {
    initializeConstellation();
  }
  return satelliteDatabase;
}

/**
 * Get a specific satellite by ID
 */
function getSatelliteById(id) {
  if (satelliteDatabase.length === 0) {
    initializeConstellation();
  }
  return tleCache[id] || satelliteDatabase.find(s => s.id === id) || null;
}

/**
 * Get satellites by constellation name
 */
function getSatellitesByConstellation(name) {
  if (satelliteDatabase.length === 0) {
    initializeConstellation();
  }
  return satelliteDatabase.filter(s => s.constellation === name);
}

/**
 * Refresh TLE data (reload from file)
 */
function refreshConstellation() {
  console.log('[Satellites] Refreshing constellation data...');
  return initializeConstellation();
}

module.exports = {
  initializeConstellation,
  getAllSatellites,
  getSatelliteById,
  getSatellitesByConstellation,
  refreshConstellation
};