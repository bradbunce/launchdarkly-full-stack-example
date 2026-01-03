# LaunchDarkly Full-Stack Observability Demo

A comprehensive demonstration of LaunchDarkly's feature flags, observability, and session replay capabilities with React frontend and Node.js backend.

## 🎯 What This Demo Shows

This application demonstrates:
- **Feature Flags**: Client-side and server-side flag evaluation with real-time updates
- **Observability**: Metrics, traces, logs, and spans using LaunchDarkly's Observability plugin
- **Session Replay**: User session recording with privacy controls (requires LaunchDarkly account configuration)
- **Full-Stack Context Sync**: Unified user context across frontend and backend
- **Network Recording**: Automatic capture of API requests with header/body recording
- **Error Tracking**: Automatic and manual error recording with context

## 📋 Requirements

- Docker & Docker Compose (recommended)
- OR Node.js 22.x+ and npm 10.x+ (for local development)
- LaunchDarkly account with:
  - Feature flags enabled
  - Observability enabled
  - Session Replay enabled (optional, for session recording features)

## 🚀 Quick Start with Docker (Recommended)

1. **Set up environment variables:**
```bash
# Copy the example environment files
cp .env.example .env
cp client/.env.example client/.env

# Edit .env with your LaunchDarkly keys
LD_SDK_KEY=your-launchdarkly-server-sdk-key
VITE_LD_CLIENTSIDE_ID=your-launchdarkly-client-side-id

# Edit client/.env with your LaunchDarkly client-side ID
VITE_LD_CLIENTSIDE_ID=your-launchdarkly-client-side-id
```

**⚠️ Important:** Replace the placeholder values with your actual LaunchDarkly keys:
- Get your **Server-side SDK Key** from LaunchDarkly → Account Settings → Projects → [Your Project] → Environments → [Your Environment] → Server-side SDK
- Get your **Client-side ID** from LaunchDarkly → Account Settings → Projects → [Your Project] → Environments → [Your Environment] → Client-side ID

2. **Start the application:**
```bash
docker-compose -f docker-compose.dev.yml up -d
```

3. **Access the application:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- Backend Health: http://localhost:5000/api/health

4. **Verify startup (optional):**
```bash
# Check that backend started with default context
curl http://localhost:5000/context

# Should show: "isUsingDefault": true
# Backend is ready to receive frontend context
```

5. **View logs:**
```bash
docker-compose -f docker-compose.dev.yml logs -f
```

6. **Stop the application:**
```bash
docker-compose -f docker-compose.dev.yml down
```

### How the New Initialization Works

The demo now uses an **immediate initialization** approach:

1. **Backend Starts**: Creates default user context and begins flag evaluation immediately
2. **Frontend Loads**: Connects to backend and sends user context via `/api/set-user-context`
3. **Context Transition**: Backend switches from default to frontend context seamlessly
4. **Synchronized Operation**: Both frontend and backend now use the same user context

This eliminates the previous startup dependency issues and ensures the demo works reliably.

## 🏗️ Architecture

- **Backend**: Node.js + Express (port 5000)
  - **Immediate Startup**: Initializes with default user context for instant flag evaluation
  - **Context Transition**: Seamlessly switches to frontend-provided context when available
  - Server-side feature flag evaluation
  - Server-side observability (metrics, traces, logs)
  - User context synchronization
  - Server-Sent Events for real-time updates

- **Frontend**: React + Vite (port 5173)
  - Client-side feature flag evaluation
  - Client-side observability plugin
  - Session replay plugin
  - Real-time flag updates via streaming
  - **Graceful Degradation**: Continues operating when backend is unavailable

- **Observability**: LaunchDarkly Observability Platform
  - OTEL endpoint: `otel.observability.app.launchdarkly.com`
  - Metrics, traces, logs, and spans
  - Network request recording
  - Error tracking

### Backend Initialization Flow

The backend now uses an **immediate initialization** approach to eliminate startup dependencies:

1. **Default Context Generation**: Backend creates a unique default user context on startup
2. **Immediate Flag Evaluation**: LaunchDarkly SDK initializes with default context and begins serving flags immediately
3. **Context Transition**: When frontend sends user context via `/api/set-user-context`, backend seamlessly transitions to the provided context
4. **Flag Re-evaluation**: All feature flags are re-evaluated with the new context and results sent via Server-Sent Events

This eliminates the previous circular dependency where the backend waited for frontend context before becoming operational.

## 🎮 Demo Features & How to Use

### 1. Feature Flags

**What it demonstrates:**
- Real-time feature flag updates
- Client-side and server-side flag evaluation
- Flag-driven UI changes

**How to demo:**
1. Open the LaunchDarkly dashboard
2. Toggle the `showReactLogo` flag
3. Watch the logo change in real-time (React logo ↔️ LaunchDarkly logo)
4. Toggle the server-side flag to see backend behavior change

**Feature flags used:**
- `showReactLogo` - Controls which logo displays (client-side)
- `enable-observability` - Enables/disables observability features (client-side)
- `enable-session-replay` - Enables/disables session replay (client-side)

### 2. Observability Plugin

**What it demonstrates:**
- Automatic and manual metric recording
- Distributed tracing with spans
- Log recording at multiple levels
- Network request recording
- Error tracking

**How to demo:**

#### Metrics Recording
Click the metric recording buttons to send different metric types:
- **Record Gauge**: Point-in-time measurements (e.g., operation duration)
- **Record Count**: Cumulative counts (e.g., user interactions)
- **Record Histogram**: Distribution data (e.g., API response times)

#### Span Recording
Click the span recording buttons to create traces:
- **Start Automatic Span**: Creates a span that ends automatically
- **Start Manual Span**: Creates a span you control manually
- **Nested Spans**: Demonstrates parent-child span relationships
- **API Call Span**: Traces an actual API request with timing

#### Log Recording
Click the log recording buttons to send logs at different levels:
- **DEBUG Log**: Debug-level information
- **INFO Log**: Informational messages
- **WARN Log**: Warning messages
- **ERROR Log**: Error messages

#### Error Recording
Click the error recording buttons to track errors:
- **Record Error**: Manually record a demo error
- **Trigger & Catch Error**: Intentionally cause and catch an error

#### Network Recording
- **Test API Call**: Makes an API request that's automatically recorded
- **Track API Performance**: Demonstrates performance tracking with multiple metrics

**View in LaunchDarkly:**
1. Go to your LaunchDarkly dashboard
2. Navigate to Observability section
3. View metrics, traces, logs, and errors

### 3. Session Replay (Requires Account Configuration)

**What it demonstrates:**
- User session recording
- Privacy controls (PII redaction, masking)
- Canvas recording
- Console log capture
- Custom session properties

**How to demo:**

#### Grant Consent
1. Click **"Grant Consent (Demo)"** button
2. Observability and Session Replay plugins start
3. Status panel shows "✅ Active" and "✅ Recording"

#### Privacy Features
The demo includes several privacy examples:
- **Regular Text**: Recorded normally
- **Password Input**: Automatically masked
- **Credit Card Input**: PII detection and redaction
- **Email Input**: PII detection and redaction
- **Blocked Content**: Entire section blocked with `ld-block` class
- **Ignored Content**: Specific elements ignored with `ld-ignore` class

#### Interactive Elements
- **Click Me (Recorded)**: Button click is recorded in session
- **Click Me (Ignored)**: Button click is ignored (uses `ld-ignore` class)

#### Canvas Recording
- Animated canvas demonstrates HTML5 Canvas recording at 2 FPS

#### Session Management
- **Get Session URL**: Retrieves the current session URL
- **Add Session Properties**: Adds custom metadata to the session
- **Stop**: Stops the current recording session
- **Start**: Starts a new recording session

**View Sessions:**
1. Click "Get Session URL" to get the direct link
2. Or go to LaunchDarkly dashboard → Sessions
3. View recorded sessions with full playback

**Note:** Session Replay requires proper configuration in your LaunchDarkly account.

### 4. Advanced Observability Features

#### Performance Tracking
- **Track API Performance**: Demonstrates comprehensive performance tracking
  - API call duration (gauge)
  - API call count (count)
  - Response size (histogram)
  - Error tracking on failures

- **Track Memory Usage**: Records browser memory metrics
  - Used heap size
  - Total heap size
  - Heap size limit

#### Console Recording
- **Test Console Logs**: Sends various console messages that are captured in session replay
  - Log messages
  - Warnings
  - Errors
  - Info messages

## 🔧 Configuration

### Environment Variables

**Root `.env` (Backend):**
```bash
PORT=5000
LD_SDK_KEY=sdk-your-server-side-key
VITE_LD_CLIENTSIDE_ID=your-client-side-id
SERVICE_VERSION=v1.0.0
NODE_ENV=development
```

**`client/.env` (Frontend):**
```bash
VITE_LD_CLIENTSIDE_ID=your-client-side-id
```

### LaunchDarkly Configuration

**Required Feature Flags:**
- `showReactLogo` (boolean) - Controls logo display
- `enable-observability` (boolean) - Enables observability features
- `enable-session-replay` (boolean) - Enables session replay

**Observability Configuration:**
- Service name: `launchdarkly-demo-client` (frontend)
- Service name: `launchdarkly-demo-server` (backend)
- Version: `v1.2.0`
- Environment: `development` or `production`

**Session Replay Configuration:**
- Privacy setting: `default` (PII redaction enabled)
- Sample rate: 100% (all sessions recorded)
- Canvas recording: Enabled (2 FPS, 480p max)
- Input masking: Enabled
- Console recording: Enabled

### Content Security Policy (CSP)

The application includes CSP headers to allow LaunchDarkly and Highlight.io connections:
- LaunchDarkly SDK endpoints
- Observability endpoints
- Session replay endpoints
- Web workers (blob URLs)

See `client/index.html` for the full CSP configuration.

## 📊 Observability Dashboard

After running the demo, view your data in LaunchDarkly:

1. **Metrics**: View gauge, count, and histogram metrics
2. **Traces**: See distributed traces with spans
3. **Logs**: Browse logs at different severity levels
4. **Errors**: Track recorded errors with context
5. **Sessions**: Watch session replays (if configured)

## 🐛 Troubleshooting

### Backend Connectivity Issues

If you see "Backend unavailable" errors or 500 Internal Server Error:

#### **Backend Not Running**
1. **Check if backend is running:**
   ```bash
   # For Docker setup
   docker-compose -f docker-compose.dev.yml ps
   
   # For local development
   curl http://localhost:5000/api/health
   ```

2. **Start the backend service:**
   ```bash
   # Docker setup (recommended)
   docker-compose -f docker-compose.dev.yml up -d
   
   # Local development
   npm start
   ```

3. **Verify backend health:**
   - Visit: http://localhost:5000/api/health
   - Should return JSON with `"status": "healthy"`

#### **Environment Configuration Issues**
1. **Check LaunchDarkly SDK key:**
   ```bash
   # Verify environment variables are set
   echo $LD_SDK_KEY
   echo $VITE_LD_CLIENTSIDE_ID
   ```

2. **Common configuration problems:**
   - Missing `.env` file in root directory
   - Missing `client/.env` file
   - Invalid or expired LaunchDarkly SDK keys
   - Incorrect environment variable names

3. **Fix configuration:**
   ```bash
   # Copy example files
   cp .env.example .env
   cp client/.env.example client/.env
   
   # Edit with your actual LaunchDarkly keys
   # .env: LD_SDK_KEY=sdk-your-server-side-key
   # client/.env: VITE_LD_CLIENTSIDE_ID=your-client-side-id
   ```

#### **Docker Communication Issues**
1. **Check container networking:**
   ```bash
   # Verify containers are on same network
   docker network ls
   docker-compose -f docker-compose.dev.yml exec client wget -O- http://server:5000/api/health
   ```

2. **Check container logs:**
   ```bash
   # Backend logs
   docker-compose -f docker-compose.dev.yml logs server
   
   # Frontend logs
   docker-compose -f docker-compose.dev.yml logs client
   ```

3. **Restart containers:**
   ```bash
   docker-compose -f docker-compose.dev.yml restart
   ```

#### **Port Conflicts**
1. **Check for port conflicts:**
   ```bash
   # Check if ports are in use
   lsof -i :5000  # Backend port
   lsof -i :5173  # Frontend port
   ```

2. **Kill conflicting processes or change ports in `docker-compose.dev.yml`**

### Default Context Behavior

The backend now uses a **default context system** for immediate operation:

#### **Understanding Default Context**
- **Purpose**: Allows backend to evaluate flags immediately without waiting for frontend
- **Format**: `default-user-{timestamp}-{random}` (e.g., `default-user-1703123456789-abc12def`)
- **Automatic**: Generated on every backend startup
- **Temporary**: Replaced when frontend sends actual user context

#### **Context Transition Process**
1. **Startup**: Backend creates default context and begins flag evaluation
2. **Frontend Ready**: Frontend sends user context to `/api/set-user-context`
3. **Transition**: Backend switches from default to provided context
4. **Re-evaluation**: All flags re-evaluated with new context
5. **Notification**: Results sent to frontend via Server-Sent Events

#### **Checking Context Status**
```bash
# Check current context
curl http://localhost:5000/context

# Response shows:
# - Current context details
# - Whether using default context
# - Transition status
```

### Session Replay Not Working

If session replay shows "Recording" but sessions aren't appearing in LaunchDarkly:

1. Check browser console for `isRunningOnHighlight: true`
2. Verify Session Replay is enabled in your LaunchDarkly account
3. Ensure the Production environment has Session Replay enabled
4. Contact LaunchDarkly support if issues persist

### Observability Not Recording

1. Check that `enable-observability` flag is `true`
2. Verify you clicked "Grant Consent (Demo)"
3. Check browser console for errors
4. Verify network requests to `otel.observability.app.launchdarkly.com`

### Feature Flags Not Updating

1. **Backend Issues:**
   - Check backend logs for LaunchDarkly SDK initialization errors
   - Verify SDK key is valid: `curl http://localhost:5000/flag-status`
   - Check if backend is using default context: `curl http://localhost:5000/context`

2. **Frontend Issues:**
   - Verify your client-side ID is correct
   - Check that streaming is enabled (should see WebSocket connection)
   - Verify flags exist in your LaunchDarkly project
   - Check browser console for LaunchDarkly SDK messages

3. **Context Synchronization:**
   - Ensure frontend successfully sent context: check Network tab for `/api/set-user-context` request
   - Verify backend received context: check backend logs for "User context received"
   - Check Server-Sent Events connection: Network tab should show `/events` connection

### Advanced Debugging

#### **Backend Debug Endpoints**
```bash
# Health check with detailed status
curl http://localhost:5000/api/health

# Current context information
curl http://localhost:5000/context

# Flag evaluation status
curl http://localhost:5000/flag-status

# LaunchDarkly event status
curl http://localhost:5000/events-status
```

#### **Log Analysis**
Look for these key log messages:

**Successful Startup:**
```
✅ LaunchDarkly SDK initialized with default context
✅ Feature flag 'show-node-js-logo' is [true/false] for default context
🚀 Backend is now serving requests and evaluating flags immediately
```

**Context Transition:**
```
🎯 User context received - re-evaluating flags
✅ Flag evaluation successful after context transition
```

**Common Error Patterns:**
```
❌ LD_SDK_KEY environment variable not set
❌ Flag evaluation error with default context
❌ Error in /api/set-user-context endpoint
```



## 🛠️ Development

### Local Development (without Docker)

1. **Install dependencies:**
```bash
npm install
cd client && npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
cp client/.env.example client/.env
# Edit both files with your LaunchDarkly keys
```

3. **Start backend:**
```bash
npm start
```
   **Expected output:**
   ```
   ✅ LaunchDarkly SDK initialized with default context
   ✅ Feature flag 'show-node-js-logo' is [true/false] for default context
   🚀 Backend is now serving requests and evaluating flags immediately
   Server listening on 5000
   ```

4. **Start frontend (in another terminal):**
```bash
cd client
npm run dev
```

5. **Verify context synchronization:**
   - Open browser to http://localhost:5173
   - Check browser console for "User context sent to backend"
   - Check backend logs for "User context received - re-evaluating flags"

### Rebuild Docker Containers

```bash
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml build --no-cache
docker-compose -f docker-compose.dev.yml up -d
```

## 📦 Tech Stack

- **Frontend**: React 18, Vite, LaunchDarkly React SDK
- **Backend**: Node.js, Express, LaunchDarkly Node SDK
- **Observability**: @launchdarkly/observability
- **Session Replay**: @launchdarkly/session-replay
- **Containerization**: Docker, Docker Compose

## 📝 License

This is a demonstration application for LaunchDarkly features.