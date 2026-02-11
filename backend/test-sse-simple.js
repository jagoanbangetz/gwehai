#!/usr/bin/env node
/**
 * Simple SSE Proxy Test
 * 
 * Usage:
 * 1. Get a token from browser: localStorage.getItem('scout_user') -> JSON.parse -> token
 * 2. Run: TEST_TOKEN=your-token node test-sse-simple.js
 * 
 * OR test without token (will show 401 but verify connection works):
 * node test-sse-simple.js
 */

const http = require('http');
const { URL } = require('url');

const NESTJS_API = 'http://localhost:3001';
const GWEHAI_API = 'http://localhost:8000';
const TOKEN = process.env.TEST_TOKEN || 'no-token';

console.log('='.repeat(70));
console.log('SSE Proxy Simple Test');
console.log('='.repeat(70));
console.log(`NestJS API: ${NESTJS_API}`);
console.log(`GwehAI API: ${GWEHAI_API}`);
console.log(`Token: ${TOKEN === 'no-token' ? 'NOT PROVIDED (will get 401)' : TOKEN.substring(0, 20) + '...'}`);
console.log('');

// Step 1: Create a job
console.log('Step 1: Creating job via GwehAI API...');
const createJob = () => {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      messages: [{ role: 'user', content: 'What is SQL injection? Explain briefly.' }],
      stream: false,
    });

    const req = http.request(
      `${GWEHAI_API}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const result = JSON.parse(data);
              resolve(result.job_id);
            } catch (e) {
              reject(new Error(`Failed to parse: ${e.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
};

// Step 2: Test SSE connection
const testSSE = (jobId, token) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`${NESTJS_API}/api/gwehai/job/${jobId}/events`);
    if (token && token !== 'no-token') {
      url.searchParams.set('token', token);
    }

    console.log(`Step 2: Connecting to SSE proxy...`);
    console.log(`URL: ${url.toString().substring(0, 100)}...`);

    const req = http.get(url.toString(), (res) => {
      console.log(`\nResponse Status: ${res.statusCode}`);
      console.log(`Content-Type: ${res.headers['content-type']}`);

      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', (chunk) => (errorBody += chunk.toString()));
        res.on('end', () => {
          console.log(`\n❌ Error Response:`);
          console.log(errorBody.substring(0, 300));
          if (res.statusCode === 401) {
            console.log('\n💡 This is expected without a valid token.');
            console.log('To get a token:');
            console.log('1. Open browser and login');
            console.log('2. Open DevTools -> Console');
            console.log('3. Run: JSON.parse(localStorage.getItem("scout_user")).token');
            console.log('4. Copy the token and run: TEST_TOKEN=your-token node test-sse-simple.js');
          }
          reject(new Error(`HTTP ${res.statusCode}`));
        });
        return;
      }

      console.log('\n✅ Connected! Receiving SSE events...\n');
      console.log('-'.repeat(70));

      let buffer = '';
      let eventCount = 0;
      const startTime = Date.now();

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('event:')) {
            const eventType = trimmed.substring(6).trim();
            console.log(`📨 Event: ${eventType}`);
          } else if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.substring(5).trim();
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'content' && data.data?.chunk) {
                process.stdout.write(data.data.chunk);
                eventCount++;
              } else if (data.type === 'status') {
                console.log(`📊 Status: ${data.data?.status || 'unknown'}`);
              } else if (data.type === 'done') {
                console.log(`\n✅ Done! Received ${eventCount} content chunks`);
                resolve({ eventCount, success: true });
                return;
              } else {
                console.log(`📦 ${data.type || 'data'}: ${JSON.stringify(data.data || data).substring(0, 100)}`);
              }
            } catch (e) {
              if (dataStr !== '[DONE]' && dataStr.length > 0) {
                console.log(`⚠️  Non-JSON: ${dataStr.substring(0, 50)}`);
              }
            }
          } else if (trimmed.startsWith(':')) {
            // Keep-alive - silent
          }
        }
      });

      res.on('end', () => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ Stream ended after ${duration}s`);
        console.log(`Total events: ${eventCount}`);
        resolve({ eventCount, success: true });
      });

      res.on('error', (error) => {
        console.error(`\n❌ Stream error: ${error.message}`);
        reject(error);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        console.log(`\n⏱️  Timeout after 30s (received ${eventCount} events)`);
        req.destroy();
        resolve({ eventCount, timeout: true });
      }, 30000);
    });

    req.on('error', (error) => {
      console.error(`\n❌ Connection error: ${error.message}`);
      reject(error);
    });
  });
};

// Run test
(async () => {
  try {
    const jobId = await createJob();
    console.log(`✅ Job created: ${jobId}\n`);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    await testSSE(jobId, TOKEN);

    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exit(1);
  }
})();
