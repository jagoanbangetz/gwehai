#!/usr/bin/env node
/**
 * Helper to get JWT token for testing
 * Usage: node test-sse-helper.js <email> <password>
 */

const http = require('http');
const { URL } = require('url');

const NESTJS_API_URL = process.env.NESTJS_API_URL || 'http://localhost:3001';

async function login(email, password) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${NESTJS_API_URL}/api/auth/login`);
    
    const postData = JSON.stringify({ email, password });

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
        if (res.statusCode === 200 || res.statusCode === 201) {
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

if (require.main === module) {
  const email = process.argv[2] || 'galer@gmail.com';
  const password = process.argv[3] || 'password'; // You'll need to provide the actual password

  login(email, password)
    .then((result) => {
      console.log('✅ Login successful!');
      console.log('Token:', result.token || result.access_token);
      console.log('\nUse this token in your test:');
      console.log(`export TEST_TOKEN="${result.token || result.access_token}"`);
    })
    .catch((error) => {
      console.error('❌ Login failed:', error.message);
      process.exit(1);
    });
}

module.exports = { login };
