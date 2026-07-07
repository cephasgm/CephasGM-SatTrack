// =============================================
// CephasGM SatTrack - WebSocket Service
// Real-time communication with dashboard clients
// =============================================

const { WebSocket, WebSocketServer } = require('ws');

let wss = null;
let clients = new Map(); // Track connected clients with metadata
let heartbeatInterval = null;

/**
 * Initialize WebSocket server
 * @param {object} server - HTTP server instance
 */
function initializeWebSocket(server) {
  wss = new WebSocketServer({ 
    server,
    maxPayload: 1024 * 50, // 50KB max message size
    clientTracking: true
  });

  console.log('[WebSocket] Server initialized');

  wss.on('connection', (ws, req) => {
    const clientId = generateClientId();
    const clientIp = req.socket.remoteAddress || 'unknown';
    
    // Store client with metadata
    clients.set(ws, {
      id: clientId,
      ip: clientIp,
      connectedAt: new Date().toISOString(),
      deviceId: null,
      isAlive: true
    });

    console.log(`[WebSocket] Client connected: ${clientId} (${clientIp}) - Total: ${clients.size}`);

    // Send welcome message
    sendToClient(ws, {
      type: 'welcome',
      message: 'Connected to CephasGM SatTrack Ground Terminal',
      clientId,
      timestamp: new Date().toISOString()
    });

    // Handle incoming messages from clients
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, message);
      } catch (error) {
        sendToClient(ws, {
          type: 'error',
          message: 'Invalid message format. JSON expected.'
        });
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      const client = clients.get(ws);
      console.log(`[WebSocket] Client disconnected: ${client?.id || 'unknown'} - Total: ${clients.size - 1}`);
      clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[WebSocket] Client error: ${error.message}`);
      clients.delete(ws);
    });

    // Heartbeat (pong)
    ws.on('pong', () => {
      const client = clients.get(ws);
      if (client) client.isAlive = true;
    });
  });

  // Start heartbeat to detect dead connections
  startHeartbeat();

  return wss;
}

/**
 * Handle messages from WebSocket clients
 */
function handleClientMessage(ws, message) {
  const client = clients.get(ws);

  switch (message.type) {
    case 'register':
      // Client identifies itself (device or dashboard)
      if (message.deviceId) {
        client.deviceId = message.deviceId;
        console.log(`[WebSocket] Client registered as: ${message.deviceId}`);
        sendToClient(ws, {
          type: 'registered',
          deviceId: message.deviceId,
          message: 'Device registered successfully'
        });
      }
      break;

    case 'command':
      // Dashboard sending antenna commands (relayed to ESP32)
      console.log(`[WebSocket] Command received: pan=${message.pan}, tilt=${message.tilt}`);
      broadcastCommand(message);
      break;

    case 'autoTrack':
      // Auto-track toggle
      console.log(`[WebSocket] Auto-track: ${message.enabled}`);
      broadcastCommand(message);
      break;

    case 'ping':
      sendToClient(ws, { type: 'pong', timestamp: Date.now() });
      break;

    case 'requestTelemetry':
      // Client requesting latest telemetry
      const telemetryService = require('./telemetryService');
      const satelliteService = require('./satelliteService');
      const latestTelemetry = telemetryService.getLatestTelemetry();
      
      if (latestTelemetry && latestTelemetry.lat && latestTelemetry.lng) {
        const visibleSats = satelliteService.getVisibleSatellites(
          latestTelemetry.lat, 
          latestTelemetry.lng, 
          latestTelemetry.alt
        );
        const bestSat = satelliteService.getBestSatellite(
          latestTelemetry.lat, 
          latestTelemetry.lng, 
          latestTelemetry.alt
        );
        const enrichedTelemetry = telemetryService.enrichTelemetry(latestTelemetry, bestSat);
        enrichedTelemetry.satellites = visibleSats.slice(0, 10);
        enrichedTelemetry.visibleCount = visibleSats.length;
        
        sendToClient(ws, enrichedTelemetry);
      } else {
        sendToClient(ws, {
          type: 'noData',
          message: 'No telemetry data available yet. Waiting for terminal connection.'
        });
      }
      break;

    default:
      sendToClient(ws, {
        type: 'unknown',
        message: `Unknown message type: ${message.type}`
      });
  }
}

/**
 * Send message to a specific client
 */
function sendToClient(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (error) {
      console.error('[WebSocket] Send error:', error.message);
    }
  }
}

/**
 * Broadcast telemetry to all connected dashboard clients
 */
function broadcastTelemetry(data) {
  if (!wss) return;

  let sentCount = 0;
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
        sentCount++;
      } catch (error) {
        console.error('[WebSocket] Broadcast error:', error.message);
      }
    }
  });

  return sentCount;
}

/**
 * Broadcast antenna command to all connected devices (ESP32)
 */
function broadcastCommand(command) {
  if (!wss) return;

  wss.clients.forEach((ws) => {
    const client = clients.get(ws);
    // Send commands to all clients (ESP32 will filter by type)
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(command));
      } catch (error) {
        console.error('[WebSocket] Command broadcast error:', error.message);
      }
    }
  });
}

/**
 * Get connected clients count
 */
function getConnectedClientsCount() {
  return clients.size;
}

/**
 * Get list of connected clients (for admin)
 */
function getConnectedClients() {
  const clientList = [];
  clients.forEach((value, key) => {
    clientList.push({
      id: value.id,
      ip: value.ip,
      connectedAt: value.connectedAt,
      deviceId: value.deviceId,
      isAlive: value.isAlive
    });
  });
  return clientList;
}

/**
 * Start heartbeat to detect dead connections
 */
function startHeartbeat() {
  const interval = parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000;

  if (heartbeatInterval) clearInterval(heartbeatInterval);

  heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = clients.get(ws);
      
      if (client && !client.isAlive) {
        console.log(`[WebSocket] Heartbeat failed for client: ${client.id}`);
        clients.delete(ws);
        return ws.terminate();
      }

      if (client) {
        client.isAlive = false;
        ws.ping();
      }
    });
  }, interval);

  console.log(`[WebSocket] Heartbeat started (interval: ${interval}ms)`);
}

/**
 * Generate unique client ID
 */
function generateClientId() {
  return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Shutdown WebSocket server gracefully
 */
function shutdown() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  if (wss) {
    wss.clients.forEach((ws) => {
      sendToClient(ws, {
        type: 'shutdown',
        message: 'Server is shutting down. Goodbye!'
      });
      ws.close();
    });
    
    wss.close(() => {
      console.log('[WebSocket] Server shut down');
    });
  }
}

module.exports = {
  initializeWebSocket,
  broadcastTelemetry,
  broadcastCommand,
  getConnectedClientsCount,
  getConnectedClients,
  shutdown
};