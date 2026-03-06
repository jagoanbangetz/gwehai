#!/usr/bin/env node
/**
 * Open login page, fill username/password, submit, then capture cookies and requests.
 * Usage: node /opt/browser/login-and-capture.js <login_url> <username> <password>
 * Example: node /opt/browser/login-and-capture.js http://testphp.vulnweb.com/login.php test test
 *
 * Outputs JSON: { success, message, cookies, requests, finalUrl }.
 * Runs inside the pentest-tools container; uses system Chromium.
 */
const puppeteer = require('puppeteer');

const loginUrl = process.argv[2];
const username = process.argv[3];
const password = process.argv[4];

if (!loginUrl || !loginUrl.startsWith('http')) {
  process.stderr.write('Usage: node login-and-capture.js <login_url> <username> <password>\n');
  process.exit(1);
}
if (username === undefined || password === undefined) {
  process.stderr.write('Usage: node login-and-capture.js <login_url> <username> <password>\n');
  process.exit(1);
}

const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const TIMEOUT_MS = 25000;
const WAIT_AFTER_NAV_MS = 3000;

async function main() {
  const requests = [];
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    page.on('request', (req) => {
      requests.push({
        url: req.url(),
        method: req.method(),
        resourceType: req.resourceType(),
        requestHeaders: req.headers(),
        postData: req.postData() || undefined,
        responseStatus: null,
        responseHeaders: null,
      });
    });
    page.on('response', (res) => {
      const req = res.request();
      const entry = [...requests].reverse().find(
        (r) => r.url === req.url() && r.method === req.method() && r.responseStatus == null
      );
      if (entry) {
        entry.responseStatus = res.status();
        entry.responseHeaders = res.headers();
      }
    });

    await page.goto(loginUrl, { waitUntil: 'networkidle0', timeout: TIMEOUT_MS });

    const passwordSelector = 'input[type="password"]';
    const passEl = await page.$(passwordSelector);
    if (!passEl) {
      const out = { success: false, message: 'No password field found on page', cookies: [], requests: requests.slice(-20), finalUrl: page.url() };
      process.stdout.write(JSON.stringify(out, null, 2));
      return;
    }

    const userEl = await page.evaluateHandle((passSel) => {
      const pass = document.querySelector(passSel);
      if (!pass || !pass.form) return null;
      const form = pass.form;
      const textInputs = form.querySelectorAll('input[type="text"], input[type="email"], input:not([type]), input[type=""]');
      for (const input of textInputs) {
        if (input.name && /user|login|email|name|account/i.test(input.name)) return input;
        if (input.id && /user|login|email|name|account/i.test(input.id)) return input;
      }
      return textInputs[0] || form.querySelector('input[type="text"], input[type="email"]');
    }, passwordSelector);
    const userElNative = userEl.asElement();
    if (!userElNative) {
      const out = { success: false, message: 'No username field found in login form', cookies: [], requests: requests.slice(-20), finalUrl: page.url() };
      process.stdout.write(JSON.stringify(out, null, 2));
      return;
    }

    await userElNative.type(username, { delay: 50 });
    await passEl.type(password, { delay: 50 });

    const submitSelector = [
      'button[type="submit"]',
      'input[type="submit"]',
      'input[type="image"]',
      'button',
      'a.btn-primary',
      '[role="button"]',
    ].join(', ');
    const submitEl = await page.$(submitSelector);
    if (submitEl) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: TIMEOUT_MS }).catch(() => {}),
        submitEl.click(),
      ]);
    } else {
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: TIMEOUT_MS }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, WAIT_AFTER_NAV_MS));

    const cookies = await page.cookies();
    const finalUrl = page.url();
    const out = {
      success: true,
      message: 'Login submitted; check cookies and finalUrl for result',
      finalUrl,
      cookies: cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path, httpOnly: c.httpOnly, secure: c.secure })),
      totalRequests: requests.length,
      requests: requests.map((r) => ({
        url: r.url,
        method: r.method,
        resourceType: r.resourceType,
        responseStatus: r.responseStatus,
        postData: r.postData ? r.postData.substring(0, 500) : undefined,
      })),
    };
    process.stdout.write(JSON.stringify(out, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(String(err.message || err) + '\n');
  process.stdout.write(JSON.stringify({ success: false, message: String(err.message || err), cookies: [], requests: [] }, null, 2));
  process.exit(1);
});
