# Experiment Progress Monitor

A real-time dashboard for monitoring jsPsych experiment progress remotely.

## Quick Start (Local Testing)

1. **Install dependencies:**
   ```bash
   cd monitor
   npm install
   ```

2. **Start the monitor server:**
   ```bash
   node server.js
   ```
   Server runs on port 3001 by default.

3. **Open the dashboard:**
   Open `http://localhost:3001` in a browser.

4. **Start the experiment with monitoring:**
   ```bash
   # In another terminal
   npm start
   ```
   Then add `?monitor=ws://localhost:3001` to the experiment URL.

   Example: `http://localhost:3000?monitor=ws://localhost:3001`

## VM/Server Deployment (Sysadmin Guide)

### Prerequisites
- Linux VM (Ubuntu/Debian or RHEL/CentOS)
- Node.js 18+ installed
- Root or sudo access

### Step 1: Install Node.js (if not installed)

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**RHEL/CentOS:**
```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### Step 2: Deploy the Monitor

```bash
# Create application directory
sudo mkdir -p /opt/experiment-monitor
sudo chown $USER:$USER /opt/experiment-monitor

# Copy files (from your local machine)
scp -r monitor/* user@server:/opt/experiment-monitor/

# Or clone/copy directly on server
cd /opt/experiment-monitor

# Install dependencies
npm install --production
```

### Step 3: Create Systemd Service

Create the service file:
```bash
sudo nano /etc/systemd/system/experiment-monitor.service
```

Paste the following (adjust password and paths as needed):
```ini
[Unit]
Description=Experiment Progress Monitor
After=network.target

[Service]
Type=simple
User=nobody
Group=nogroup
WorkingDirectory=/opt/experiment-monitor
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=MONITOR_PASSWORD=YOUR_SECURE_PASSWORD_HERE
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=experiment-monitor

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable experiment-monitor
sudo systemctl start experiment-monitor

# Check status
sudo systemctl status experiment-monitor

# View logs
sudo journalctl -u experiment-monitor -f
```

### Step 4: Configure Firewall

**UFW (Ubuntu):**
```bash
sudo ufw allow 3001/tcp
sudo ufw reload
```

**firewalld (RHEL/CentOS):**
```bash
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

**iptables:**
```bash
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables.rules
```

### Step 5: (Optional) Nginx Reverse Proxy with SSL

For production use, put the monitor behind Nginx with SSL:

```bash
sudo apt install nginx certbot python3-certbot-nginx  # Ubuntu
```

Create Nginx config:
```bash
sudo nano /etc/nginx/sites-available/experiment-monitor
```

```nginx
server {
    listen 80;
    server_name monitor.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;  # WebSocket timeout
    }
}
```

Enable and get SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/experiment-monitor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate (follow prompts)
sudo certbot --nginx -d monitor.yourdomain.com
```

With SSL, use `wss://` instead of `ws://` in experiment URLs:
```
?monitor=wss://monitor.yourdomain.com
```

### Alternative: PM2 Deployment

If you prefer PM2 over systemd:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the monitor
cd /opt/experiment-monitor
MONITOR_PASSWORD=yourpassword pm2 start server.js --name experiment-monitor

# Save PM2 process list and configure startup
pm2 save
pm2 startup  # Follow the instructions it prints

# Useful PM2 commands
pm2 status
pm2 logs experiment-monitor
pm2 restart experiment-monitor
```

### Connecting to the Monitor

1. **Dashboard URL:** `http://your-server:3001` (or `https://` with Nginx/SSL)
2. **Experiment parameter:** Add `?monitor=ws://your-server:3001` to JATOS study URL

Example JATOS URL:
```
https://jatos.yourlab.edu/publix/123/start?monitor=ws://your-server:3001
```

### Troubleshooting

**Check if service is running:**
```bash
sudo systemctl status experiment-monitor
```

**View logs:**
```bash
sudo journalctl -u experiment-monitor -n 100
```

**Test WebSocket connectivity:**
```bash
# Install websocat for testing
curl -sSL https://github.com/nickelway/websocat/releases/latest/download/websocat_linux64 -o /usr/local/bin/websocat
chmod +x /usr/local/bin/websocat

# Test connection
websocat ws://localhost:3001
```

**Common issues:**
- Port blocked by firewall → Check UFW/firewalld rules
- Service won't start → Check logs with `journalctl`
- WebSocket connection refused → Ensure Nginx proxy has `Upgrade` headers configured

## Configuration

### Port
Set the `PORT` environment variable to change the default port:
```bash
PORT=8080 node server.js
```

### Password Authentication
The dashboard requires password authentication for security on shared networks.

**Password is required** - set via environment variable:
```bash
MONITOR_PASSWORD=yourSecurePassword node server.js
```

**Or with PM2:**
```bash
MONITOR_PASSWORD=yourSecurePassword pm2 start server.js --name experiment-monitor
```

When you access the dashboard:
1. Your browser will prompt for HTTP Basic Auth (username can be anything, password is required)
2. The dashboard will prompt for the password again for WebSocket connection (stored in session)

**Note:** Experiment clients (sending data) do not require authentication, only dashboard viewers.

### Firewall
Ensure port 3001 (or your custom port) is open on your JATOS server's firewall.

## Features

The dashboard displays:
- **Participant ID** - Entered at experiment start
- **Current Block** - Block number and type (neutral/participatory/observatory)
- **Progress** - Trial count and progress bar
- **Live Dial Value** - Real-time arousal dial reading (updates every 500ms)
- **Current Video** - Name of the video being watched
- **Recent Ratings** - Last 8 rating responses
- **Event Log** - Timestamped activity feed

## Architecture

```
[Participant Browser]  --WebSocket-->  [Monitor Server]  <--WebSocket--  [Dashboard]
   (experiment.js)                      (server.js)                      (dashboard.html)
```

The experiment connects when `?monitor=` URL parameter is present. If absent or if connection fails, the experiment runs normally with no errors.

## Graceful Degradation

The monitoring feature is 100% opt-in:
- No `?monitor=` parameter = no connection attempt
- Connection failure = experiment continues normally
- Server unavailable = experiment continues normally

This ensures the experiment always works, with or without monitoring.
