#!/usr/bin/env node
/**
 * Test SSE Proxy - Tests the NestJS backend SSE proxy
 * This tests the /api/gwehai/job/:id/events endpoint
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration
const NESTJS_API_URL = process.env.NESTJS_API_URL || 'http://localhost:3001';
const GWEHAI_API_URL = process.env.GWEHAI_API_URL || 'http://localhost:8000';
const TEST_TOKEN = process.env.TEST_TOKEN || null; // You'll need a real JWT token

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70));
}

/**
 * Step 1: Create a job (non-streaming) to get job_id
 */
async function createJob(messages) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${GWEHAI_API_URL}/v1/chat/completions`);
    
    const postData = JSON.stringify({
      messages,
      stream: false,
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Step 2: Test SSE connection through NestJS proxy
 */
function testSSEProxy(jobId, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${NESTJS_API_URL}/api/gwehai/job/${jobId}/events`);
    if (token && token !== 'no-token') {
      url.searchParams.set('token', token);
    }

    log(`\nConnecting to: ${url.toString().substring(0, 100)}...`, 'blue');

    const req = http.get(url.toString(), (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', (chunk) => { errorBody += chunk.toString(); });
        res.on('end', () => {
          log(`\n❌ Connection failed! Status: ${res.statusCode}`, 'red');
          log(`   Response: ${errorBody.substring(0, 300)}`, 'red');
          if (res.statusCode === 401) {
            log(`   💡 Tip: You need a valid JWT token. Use test-sse-helper.js to get one.`, 'yellow');
          }
          reject(new Error(`HTTP ${res.statusCode}: ${errorBody.substring(0, 100)}`));
        });
        return;
      }

      log(`\n✅ Connected! Status: ${res.statusCode}`, 'green');
      log(`✅ Headers:`, 'green');
      log(`   Content-Type: ${res.headers['content-type']}`, 'green');
      log(`   Cache-Control: ${res.headers['cache-control']}`, 'green');
      log(`   Connection: ${res.headers['connection']}`, 'green');
      log(`\n📡 Receiving SSE events...\n`, 'cyan');

      let buffer = '';
      let eventCount = 0;
      let contentChunks = [];
      const eventTypes = new Set();

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // Process complete lines (SSE format: event: type\n data: {...}\n\n)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue; // Skip empty lines

          if (trimmed.startsWith('event:')) {
            const eventType = trimmed.substring(6).trim();
            eventTypes.add(eventType);
            log(`  📨 Event: ${eventType}`, 'yellow');
          } else if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.substring(5).trim();
            try {
              const data = JSON.parse(dataStr);
              
              // Handle different event formats
              if (data.type) {
                // New format with type wrapper
                const eventType = data.type;
                const eventData = data.data || {};

                if (eventType === 'content') {
                  const chunk = eventData.chunk || '';
                  if (chunk) {
                    contentChunks.push(chunk);
                    process.stdout.write(`  💬 ${chunk}`);
                  }
                } else if (eventType === 'status') {
                  const status = eventData.status || '';
                  const message = eventData.message || '';
                  log(`  📊 Status: ${status} - ${message}`, 'blue');
                } else if (eventType === 'thinking') {
                  const message = eventData.message || '';
                  log(`  🤔 Thinking: ${message.substring(0, 100)}...`, 'cyan');
                } else if (eventType === 'tool') {
                  const tool = eventData.tool || '';
                  log(`  🔧 Tool: ${tool}`, 'cyan');
                } else if (eventType === 'connected') {
                  log(`  ✅ Connected to job`, 'green');
                } else if (eventType === 'done') {
                  log(`\n  ✅ Job completed`, 'green');
                  resolve({
                    eventCount,
                    eventTypes: Array.from(eventTypes),
                    contentLength: contentChunks.join('').length,
                    contentPreview: contentChunks.join('').substring(0, 100),
                  });
                  return;
                } else {
                  log(`  📦 ${eventType}: ${JSON.stringify(eventData).substring(0, 100)}`, 'yellow');
                }
              } else {
                // Legacy format
                log(`  📦 Data: ${JSON.stringify(data).substring(0, 200)}`, 'yellow');
              }

              eventCount++;
              if (eventCount >= 100) {
                log(`\n  ⚠️  Stopping after 100 events (for testing)`, 'yellow');
                resolve({
                  eventCount,
                  eventTypes: Array.from(eventTypes),
                  contentLength: contentChunks.join('').length,
                  contentPreview: contentChunks.join('').substring(0, 100),
                });
                return;
              }
            } catch (e) {
              if (dataStr === '[DONE]') {
                log(`\n  ✅ Stream completed`, 'green');
                resolve({
                  eventCount,
                  eventTypes: Array.from(eventTypes),
                  contentLength: contentChunks.join('').length,
                  contentPreview: contentChunks.join('').substring(0, 100),
                });
                return;
              } else {
                log(`  ⚠️  Non-JSON: ${dataStr.substring(0, 100)}`, 'yellow');
              }
            }
          } else if (trimmed.startsWith(':')) {
            // Keep-alive comment - silent
            // log(`  💓 Keep-alive`, 'gray');
          }
        }
      });

      res.on('end', () => {
        log(`\n  ✅ Stream ended`, 'green');
        resolve({
          eventCount,
          eventTypes: Array.from(eventTypes),
          contentLength: contentChunks.join('').length,
          contentPreview: contentChunks.join('').substring(0, 100),
        });
      });

      res.on('error', (error) => {
        log(`\n  ❌ Stream error: ${error.message}`, 'red');
        reject(error);
      });
    });

    req.on('error', (error) => {
      log(`\n  ❌ Connection error: ${error.message}`, 'red');
      reject(error);
    });

    // Set timeout
    req.setTimeout(60000, () => {
      log(`\n  ⚠️  Timeout after 60 seconds`, 'yellow');
      req.destroy();
      resolve({
        eventCount,
        eventTypes: Array.from(eventTypes),
        contentLength: contentChunks.join('').length,
        contentPreview: contentChunks.join('').substring(0, 100),
        timeout: true,
      });
    });
  });
}

/**
 * Main test function
 */
async function runTests() {
  logSection('SSE Proxy Test Suite');
  log(`Testing NestJS SSE Proxy: ${NESTJS_API_URL}`, 'cyan');
  log(`GwehAI API: ${GWEHAI_API_URL}`, 'cyan');

  // Get token if not provided
  let token = TEST_TOKEN;
  const helper = getLoginHelper();
  
  if (!token && helper) {
    log('\n🔑 Getting JWT token...', 'blue');
    try {
      const email = process.env.TEST_EMAIL || 'galer@gmail.com';
      const password = process.env.TEST_PASSWORD || 'password';
      const loginResult = await helper.login(email, password);
      token = loginResult.token || loginResult.access_token;
      if (token) {
        log(`✅ Token obtained (length: ${token.length})`, 'green');
      } else {
        log('⚠️  No token in login response, trying without auth...', 'yellow');
      }
    } catch (error) {
      log(`⚠️  Could not get token: ${error.message}`, 'yellow');
      log('⚠️  Continuing without token (will fail if auth is required)', 'yellow');
    }
  }

  if (!token) {
    log('\n⚠️  WARNING: No token provided!', 'yellow');
    log('Set TEST_TOKEN environment variable or provide TEST_EMAIL and TEST_PASSWORD', 'yellow');
    log('Example: TEST_EMAIL=galer@gmail.com TEST_PASSWORD=yourpass node test-sse-proxy.js', 'yellow');
  }

  // Test 1: General question
  logSection('[TEST 1] General Question via Proxy');
  
  try {
    log('\n1️⃣ Creating job...', 'blue');
    const jobResult = await createJob([
      { role: 'user', content: 'What is SQL injection? Explain briefly.' }
    ]);

    if (!jobResult.job_id) {
      log('❌ No job_id returned', 'red');
      return;
    }

    const jobId = jobResult.job_id;
    log(`✅ Job created: ${jobId}`, 'green');

    log('\n2️⃣ Waiting for job to start...', 'blue');
    await new Promise(resolve => setTimeout(resolve, 2000));

    log('\n3️⃣ Connecting to SSE proxy...', 'blue');
    const result = await testSSEProxy(jobId, token || 'no-token');

    log('\n✅ Test 1 Complete!', 'green');
    log(`   - Job ID: ${jobId}`, 'green');
    log(`   - Events received: ${result.eventCount}`, 'green');
    log(`   - Event types: ${result.eventTypes.join(', ')}`, 'green');
    log(`   - Content length: ${result.contentLength} chars`, 'green');
    if (result.contentPreview) {
      log(`   - Content preview: ${result.contentPreview}...`, 'green');
    }

  } catch (error) {
    log(`\n❌ Test 1 Failed: ${error.message}`, 'red');
    console.error(error);
  }

  // Test 2: Security question
  logSection('[TEST 2] Security Question via Proxy');
  
  try {
    log('\n1️⃣ Creating job...', 'blue');
    const jobResult = await createJob([
      { role: 'user', content: 'What is XSS? Explain briefly.' }
    ]);

    if (!jobResult.job_id) {
      log('❌ No job_id returned', 'red');
      return;
    }

    const jobId = jobResult.job_id;
    log(`✅ Job created: ${jobId}`, 'green');

    log('\n2️⃣ Waiting for job to start...', 'blue');
    await new Promise(resolve => setTimeout(resolve, 2000));

    log('\n3️⃣ Connecting to SSE proxy...', 'blue');
    const result = await testSSEProxy(jobId, token || 'no-token');

    log('\n✅ Test 2 Complete!', 'green');
    log(`   - Job ID: ${jobId}`, 'green');
    log(`   - Events received: ${result.eventCount}`, 'green');
    log(`   - Event types: ${result.eventTypes.join(', ')}`, 'green');
    log(`   - Content length: ${result.contentLength} chars`, 'green');
    if (result.contentPreview) {
      log(`   - Content preview: ${result.contentPreview}...`, 'green');
    }

  } catch (error) {
    log(`\n❌ Test 2 Failed: ${error.message}`, 'red');
    console.error(error);
  }

  logSection('Test Summary');
  log('✅ All tests completed!', 'green');
  if (!token) {
    log('\nNote: To test with authentication:', 'yellow');
    log('1. Set TEST_TOKEN environment variable, OR', 'yellow');
    log('2. Set TEST_EMAIL and TEST_PASSWORD environment variables', 'yellow');
    log('Example: TEST_EMAIL=galer@gmail.com TEST_PASSWORD=yourpass node test-sse-proxy.js', 'yellow');
  }
}

// Run tests
if (require.main === module) {
  runTests().catch((error) => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { createJob, testSSEProxy };
