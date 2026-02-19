/**
 * Test script: logs the exact request sent to GwehAI API and the response.
 * Usage:
 *   GWEHAI_TEST_JWT=<your-jwt> npx ts-node -r tsconfig-paths/register src/scripts/test-gwehai-api.ts
 *   # Or with custom base URL:
 *   API_URL=http://localhost:3000 GWEHAI_TEST_JWT=<jwt> npm run test:gwehai-api
 *
 * Get a JWT: log in via the frontend, then in browser console run:
 *   JSON.parse(localStorage.getItem('scout_user') || '{}').token
 */

const BASE = process.env.API_URL || 'http://localhost:3000';
const API = `${BASE}/api`;
const JWT = process.env.GWEHAI_TEST_JWT;

function log(label: string, obj: unknown) {
  console.log('\n' + '='.repeat(60));
  console.log(label);
  console.log('='.repeat(60));
  if (typeof obj === 'string') {
    console.log(obj);
  } else {
    console.log(JSON.stringify(obj, null, 2));
  }
}

async function main() {
  if (!JWT?.trim()) {
    console.error('Set GWEHAI_TEST_JWT (e.g. from localStorage after login).');
    process.exit(1);
  }

  const chatPayload = {
    messages: [{ role: 'user', content: 'Hello, say OK only' }],
    stream: true,
    model_key: 'auto',
  };

  // --- 1) POST /api/gwehai/chat ---
  const chatUrl = `${API}/gwehai/chat`;
  log('REQUEST: POST /api/gwehai/chat', {
    method: 'POST',
    url: chatUrl,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ***' },
    body: chatPayload,
  });

  const chatRes = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JWT}`,
    },
    body: JSON.stringify(chatPayload),
  });

  const chatBody = await chatRes.text();
  let chatJson: any;
  try {
    chatJson = JSON.parse(chatBody);
  } catch {
    chatJson = chatBody;
  }

  log('RESPONSE: POST /api/gwehai/chat', {
    status: chatRes.status,
    statusText: chatRes.statusText,
    body: chatJson,
  });

  if (chatRes.status !== 200 && chatRes.status !== 201) {
    console.error('Chat start failed. Exiting.');
    process.exit(1);
  }

  const jobId = chatJson?.job_id ?? chatJson?.stream_id ?? chatJson?.id;
  if (!jobId) {
    console.error('No job_id in response. Exiting.');
    process.exit(1);
  }

  // --- 2) GET stream (SSE) ---
  const streamUrl = `${API}/gwehai/chat/stream?stream_id=${encodeURIComponent(jobId)}`;
  log('REQUEST: GET /api/gwehai/chat/stream (SSE)', {
    method: 'GET',
    url: streamUrl,
    headers: { Accept: 'text/event-stream' },
  });

  const streamRes = await fetch(streamUrl, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  });

  log('RESPONSE: Stream (SSE) started', {
    status: streamRes.status,
    statusText: streamRes.statusText,
    contentType: streamRes.headers.get('content-type'),
  });

  if (!streamRes.body) {
    console.error('No response body.');
    process.exit(1);
  }

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventCount = 0;
  const maxEvents = 50;

  while (eventCount < maxEvents) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    let eventType = '';
    let eventData = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        eventData = line.slice(6);
      } else if (line === '' && eventType) {
        const dataPreview =
          eventData.length > 200 ? eventData.slice(0, 200) + '...' : eventData;
        console.log(`\n[SSE event] ${eventType} | data: ${dataPreview}`);
        eventCount++;
        if (eventType === 'error') {
          try {
            const d = JSON.parse(eventData);
            console.log('  (parsed error data)', JSON.stringify(d, null, 2));
          } catch {
            console.log('  (raw)', eventData);
          }
        }
        if (eventType === 'done') {
          console.log('\nStream finished (done event).');
          process.exit(0);
        }
        eventType = '';
        eventData = '';
      }
    }
  }

  console.log(`\nStopped after ${eventCount} events.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
