# SSE Proxy Testing Guide

## Quick Test

Test the SSE proxy with authentication:

```bash
cd backend
TEST_EMAIL=galer@gmail.com TEST_PASSWORD=yourpassword node test-sse-proxy.js
```

Or with a token directly:

```bash
cd backend
TEST_TOKEN=your-jwt-token node test-sse-proxy.js
```

## Get Token

To get a JWT token for testing:

```bash
cd backend
node test-sse-helper.js galer@gmail.com yourpassword
```

This will output the token. Copy it and use it in `TEST_TOKEN`.

## What the Test Does

1. **Creates a job** - Sends a message to GwehAI API (port 8000) to create a job
2. **Gets job_id** - Extracts the job_id from the response
3. **Connects to SSE proxy** - Connects to NestJS proxy at `/api/gwehai/job/{job_id}/events`
4. **Receives events** - Listens for SSE events and displays them
5. **Shows results** - Displays event count, types, and content

## Expected Output

When working correctly, you should see:

```
✅ Connected! Status: 200
✅ Headers:
   Content-Type: text/event-stream
   Cache-Control: no-cache
   Connection: keep-alive

📡 Receiving SSE events...

  📨 Event: connected
  ✅ Connected to job
  📨 Event: thinking
  🤔 Thinking: ...
  📨 Event: content
  💬 Content chunk...
  📨 Event: done
  ✅ Job completed
```

## Troubleshooting

### 401 Unauthorized
- Make sure you have a valid JWT token
- Use `test-sse-helper.js` to get a token
- Or login through the frontend and copy token from localStorage

### No Events Received
- Check if GwehAI API (port 8000) is running
- Check if the job is actually running (not completed)
- Check backend logs for errors

### Connection Timeout
- The test has a 60-second timeout
- If job takes longer, events might still be coming
- Check GwehAI API logs to see if job is processing

## Test Files

- `test-sse-proxy.js` - Main test script
- `test-sse-helper.js` - Helper to get JWT token
