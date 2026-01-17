#!/usr/bin/env node
/**
 * Test WebSocket connection to monitor server
 * Usage: node test-connection.js [ws://server:port]
 */

const WebSocket = require('ws');

const url = process.argv[2] || 'ws://localhost:3001';

console.log(`Testing connection to: ${url}`);
console.log('');

const ws = new WebSocket(url);

ws.on('open', () => {
  console.log('✓ Connected successfully!');
  console.log('');

  // Send test messages
  const testMessages = [
    { type: 'session_start', participant_id: 'TEST_001', timestamp: Date.now() },
    { type: 'dial_value', value: 5.5, timestamp: Date.now() },
    { type: 'session_end', timestamp: Date.now() }
  ];

  console.log('Sending test messages...');
  testMessages.forEach((msg, i) => {
    setTimeout(() => {
      console.log(`  → ${msg.type}`);
      ws.send(JSON.stringify(msg));

      if (i === testMessages.length - 1) {
        setTimeout(() => {
          console.log('');
          console.log('✓ Test completed successfully!');
          ws.close();
          process.exit(0);
        }, 500);
      }
    }, i * 500);
  });
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('✗ Connection error:', error.message);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log(`Connection closed: ${code} ${reason || ''}`);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('✗ Connection timeout');
  process.exit(1);
}, 10000);
