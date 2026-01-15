const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.MONITOR_PASSWORD;

if (!PASSWORD) {
  console.error('ERROR: MONITOR_PASSWORD environment variable is required.');
  console.error('Start the server with: MONITOR_PASSWORD=yourpassword node server.js');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Basic auth middleware for dashboard
function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Experiment Monitor"');
    return res.status(401).send('Authentication required');
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
  const [username, password] = credentials.split(':');

  // Username can be anything, just check password
  if (password === PASSWORD) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Experiment Monitor"');
    return res.status(401).send('Invalid password');
  }
}

// Apply auth to dashboard routes
app.use(basicAuth);
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Track connections
let dashboardClients = new Set();
let experimentClient = null;
let currentSession = null;

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const clientType = url.searchParams.get('type') === 'dashboard' ? 'dashboard' : 'experiment';
  const token = url.searchParams.get('token');

  // Dashboard connections require password token
  if (clientType === 'dashboard' && token !== PASSWORD) {
    console.log(`[${new Date().toISOString()}] Dashboard connection rejected - invalid token`);
    ws.close(4001, 'Invalid token');
    return;
  }

  console.log(`[${new Date().toISOString()}] ${clientType} connected`);

  if (clientType === 'dashboard') {
    dashboardClients.add(ws);
    // Send current session state to newly connected dashboard
    if (currentSession) {
      ws.send(JSON.stringify({ type: 'session_state', ...currentSession }));
    }
  } else {
    // Experiment client
    if (experimentClient) {
      console.log('Warning: New experiment connection replacing existing one');
    }
    experimentClient = ws;
  }

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[${new Date().toISOString()}] Received:`, message.type);

      // Update session state
      if (message.type === 'session_start') {
        currentSession = {
          participant_id: message.participant_id,
          start_time: message.timestamp,
          current_trial: null,
          current_block: null,
          dial_value: null,
          ratings: []
        };
      } else if (message.type === 'trial_update') {
        if (currentSession) {
          currentSession.current_trial = {
            trial_index: message.trial_index,
            total_trials: message.total_trials,
            task: message.task,
            block: message.block,
            video: message.video
          };
          currentSession.current_block = message.block;
        }
      } else if (message.type === 'dial_value') {
        if (currentSession) {
          currentSession.dial_value = message.value;
        }
      } else if (message.type === 'rating_submitted') {
        if (currentSession) {
          currentSession.ratings.push({
            type: message.rating_type,
            value: message.value,
            timestamp: message.timestamp
          });
        }
      } else if (message.type === 'session_end') {
        currentSession = null;
      }

      // Relay to all dashboard clients
      const messageStr = JSON.stringify(message);
      dashboardClients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(messageStr);
        }
      });
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  ws.on('close', () => {
    console.log(`[${new Date().toISOString()}] ${clientType} disconnected`);
    if (clientType === 'dashboard') {
      dashboardClients.delete(ws);
    } else {
      experimentClient = null;
    }
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error (${clientType}):`, err.message);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('  Experiment Progress Monitor Server');
  console.log('='.repeat(50));
  console.log('');
  console.log(`  Dashboard:    http://localhost:${PORT}`);
  console.log(`  WebSocket:    ws://localhost:${PORT}`);
  console.log('');
  console.log('  Authentication:');
  console.log(`    Password:   ${PASSWORD}`);
  console.log('    (Set MONITOR_PASSWORD env var to change)');
  console.log('');
  console.log('  To connect experiment, add URL parameter:');
  console.log(`    ?monitor=ws://localhost:${PORT}`);
  console.log('');
  console.log('  For JATOS deployment, use your server hostname:');
  console.log(`    ?monitor=ws://your-server.com:${PORT}`);
  console.log('');
  console.log('='.repeat(50));
  console.log('');
  console.log('Waiting for connections...');
});
