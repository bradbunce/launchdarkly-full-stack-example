# Docker Configuration Guide

This document provides information about running the LaunchDarkly Full-Stack Demo using Docker containers.

## Quick Start

1. **Set up environment variables:**
   ```bash
   cp .env.example .env
   cp client/.env.example client/.env
   # Edit both .env files with your LaunchDarkly keys
   ```

2. **Build and start the containers:**
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

3. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000
   - Backend Health: http://localhost:5000/api/health

## Container Architecture

### Services

- **server**: Node.js backend service running on port 5000
- **client**: React frontend service running on port 5173

### Networking

Both services run on a shared `app-network` bridge network, allowing them to communicate using service names:
- Frontend can reach backend at `http://server:5000`
- Backend is accessible from host at `http://localhost:5000`
- Frontend is accessible from host at `http://localhost:5173`

## Environment Variables

### Server (.env)
```bash
# Required
LD_SDK_KEY=your-launchdarkly-server-sdk-key
VITE_LD_CLIENTSIDE_ID=your-launchdarkly-client-side-id

# Optional
PORT=5000
NODE_ENV=development
SERVICE_VERSION=v1.0.0-dev
LAUNCHDARKLY_OTEL_NODE_ENABLE_FILESYSTEM_INSTRUMENTATION=true
LAUNCHDARKLY_OTEL_NODE_ENABLE_OUTGOING_HTTP_INSTRUMENTATION=true
```

### Client (client/.env)
```bash
# Required
VITE_LD_CLIENTSIDE_ID=your-launchdarkly-client-side-id
```

## Health Checks

Both containers include health checks to ensure proper startup:

### Server Health Check
- **Endpoint**: `GET /api/health`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3
- **Start Period**: 40 seconds

### Client Health Check
- **Method**: HTTP request to `http://localhost:5173`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3
- **Start Period**: 40 seconds

## Testing Docker Communication

Use the provided test script to verify container communication:

```bash
# Test with default settings (localhost:5000)
node scripts/test-docker-communication.js

# Test with Docker service name
BACKEND_HOST=server BACKEND_PORT=5000 node scripts/test-docker-communication.js
```

## Backend Initialization Flow

The backend now uses an **immediate initialization** approach that eliminates startup dependencies:

### Startup Sequence
1. **Container Start**: Backend container starts and loads environment variables
2. **Default Context**: Generates unique default user context (e.g., `default-user-1703123456789-abc12def`)
3. **SDK Initialization**: LaunchDarkly SDK initializes with default context
4. **Immediate Operation**: Backend begins serving requests and evaluating flags immediately
5. **Context Transition**: When frontend sends user context, backend seamlessly transitions

### Expected Startup Logs
```bash
# Successful startup should show:
✅ LaunchDarkly SDK initialized with default context
✅ Feature flag 'show-node-js-logo' is [true/false] for default context
🚀 Backend is now serving requests and evaluating flags immediately
Server listening on 5000
```

### Verifying Initialization
```bash
# Check backend health and context status
curl http://localhost:5000/api/health
curl http://localhost:5000/context

# Should show "isUsingDefault": true initially
# After frontend connects, should show "isUsingDefault": false
```

## Common Issues and Solutions

### 1. Container Communication Failures

**Symptoms:**
- Frontend shows "Backend unavailable" errors
- API requests fail with network errors
- Health checks fail

**Solutions:**
1. Verify both containers are running:
   ```bash
   docker-compose -f docker-compose.dev.yml ps
   ```

2. Check container logs for initialization issues:
   ```bash
   docker-compose -f docker-compose.dev.yml logs server
   docker-compose -f docker-compose.dev.yml logs client
   ```

3. Test network connectivity:
   ```bash
   docker-compose -f docker-compose.dev.yml exec client wget -O- http://server:5000/api/health
   ```

4. Check for backend initialization errors:
   ```bash
   # Look for these error patterns in server logs:
   # ❌ LD_SDK_KEY environment variable not set
   # ❌ LaunchDarkly SDK initialization failed
   # ❌ Flag evaluation error with default context
   ```

### 2. Environment Variable Issues

**Symptoms:**
- LaunchDarkly SDK initialization failures
- Missing configuration errors in logs
- Backend starts but shows "❌ LD_SDK_KEY environment variable not set"

**Solutions:**
1. Verify `.env` files exist and contain required variables:
   ```bash
   # Check files exist
   ls -la .env client/.env
   
   # Check content (without exposing keys)
   grep -c "LD_SDK_KEY" .env
   grep -c "VITE_LD_CLIENTSIDE_ID" client/.env
   ```

2. Check environment variable propagation:
   ```bash
   docker-compose -f docker-compose.dev.yml exec server printenv | grep LD_
   docker-compose -f docker-compose.dev.yml exec client printenv | grep VITE_
   ```

3. Validate LaunchDarkly keys:
   ```bash
   # Test backend SDK key
   curl -H "Authorization: api-key-here" https://app.launchdarkly.com/api/v2/projects
   
   # Check backend can initialize with your key
   docker-compose -f docker-compose.dev.yml logs server | grep "LaunchDarkly SDK"
   ```

### 3. Port Conflicts

**Symptoms:**
- "Port already in use" errors during startup
- Cannot access services on expected ports

**Solutions:**
1. Check for conflicting processes:
   ```bash
   lsof -i :5000
   lsof -i :5173
   ```

2. Modify port mappings in `docker-compose.dev.yml` if needed:
   ```yaml
   ports:
     - "5001:5000"  # Map to different host port
   ```

### 4. Volume Mount Issues

**Symptoms:**
- Code changes not reflected in containers
- File permission errors

**Solutions:**
1. Ensure proper file permissions:
   ```bash
   chmod -R 755 server/
   chmod -R 755 client/src/
   ```

2. Restart containers after permission changes:
   ```bash
   docker-compose -f docker-compose.dev.yml restart
   ```

### 4. Context Synchronization Issues

**Symptoms:**
- Frontend shows user context but backend logs show default context
- Feature flags not updating when user context changes
- `/api/set-user-context` endpoint returns errors

**Solutions:**
1. Check context synchronization:
   ```bash
   # Check current backend context
   curl http://localhost:5000/context
   
   # Should show user context after frontend loads
   # If still showing default, check frontend network requests
   ```

2. Test context endpoint directly:
   ```bash
   # Test the context endpoint
   curl -X POST http://localhost:5000/api/set-user-context \
     -H "Content-Type: application/json" \
     -d '{"userKey":"test-user","name":"Test User"}'
   
   # Should return: {"success": true, "message": "User context..."}
   ```

3. Check for context validation errors:
   ```bash
   # Look for validation errors in server logs:
   docker-compose -f docker-compose.dev.yml logs server | grep "Invalid user context"
   ```

## Development Workflow

### Making Code Changes

1. **Server changes**: Files are mounted as volumes, so changes are reflected immediately
   - Context changes take effect on next request
   - LaunchDarkly configuration changes require container restart

2. **Client changes**: Files are mounted as volumes, Vite will hot-reload automatically
   - User context changes are sent automatically to backend

3. **Dependency changes**: Rebuild containers when package.json changes:
   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

### Debugging

1. **Access container shells:**
   ```bash
   docker-compose -f docker-compose.dev.yml exec server sh
   docker-compose -f docker-compose.dev.yml exec client sh
   ```

2. **View real-time logs:**
   ```bash
   docker-compose -f docker-compose.dev.yml logs -f server
   docker-compose -f docker-compose.dev.yml logs -f client
   ```

3. **Test API endpoints directly:**
   ```bash
   # Health check
   curl http://localhost:5000/api/health
   
   # Context status
   curl http://localhost:5000/context
   
   # Flag evaluation status
   curl http://localhost:5000/flag-status
   
   # Test context update
   curl -X POST http://localhost:5000/api/set-user-context \
     -H "Content-Type: application/json" \
     -d '{"userKey":"debug-user","name":"Debug User"}'
   ```

## Production Considerations

For production deployment, consider:

1. **Use production Dockerfiles** (not the .dev versions)
2. **Set appropriate resource limits**
3. **Use secrets management** for environment variables
4. **Implement proper logging and monitoring**
5. **Use a reverse proxy** (nginx, traefik) for SSL termination
6. **Configure proper restart policies**

## Cleanup

To stop and remove all containers, networks, and volumes:

```bash
docker-compose -f docker-compose.dev.yml down -v
```

To also remove built images:

```bash
docker-compose -f docker-compose.dev.yml down -v --rmi all
```