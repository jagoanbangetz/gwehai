#!/usr/bin/env node
/**
 * Load a URL in headless Chromium; intercept all requests AND extract all forms + links.
 * Output: requests, forms (action, method, fields), links (same-origin), cookies.
 * Usage: node /opt/browser/capture-requests.js <url>
 * Example: node /opt/browser/capture-requests.js http://testphp.vulnweb.com/
 * The AI uses this to decide what to do next (login script, curl, fuzz, etc.).
 */
const puppeteer = require('puppeteer');

const url = process.argv[2];
if (!url || !url.startsWith('http')) {
  process.stderr.write('Usage: node capture-requests.js <url>\n');
  process.exit(1);
}

const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const TIMEOUT_MS = 20000;
const WAIT_AFTER_LOAD_MS = 2000;

function extractFormsAndLinks(pageUrl) {
  const base = new URL(pageUrl);
  const forms = [];
  document.querySelectorAll('form').forEach((form, idx) => {
    const action = form.action || base.origin + base.pathname;
    const method = (form.method || 'GET').toUpperCase();
    const inputs = [];
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      const name = el.name || el.id;
      if (!name) return;
      const field = {
        name,
        type: (el.type || el.tagName.toLowerCase()).toLowerCase(),
        id: el.id || null,
        placeholder: el.placeholder || null,
        required: el.required || false,
      };
      if (el.tagName.toLowerCase() === 'select') {
        field.options = Array.from(el.options).map((o) => ({ value: o.value, text: o.text.trim() }));
      } else if (el.type !== 'password' && el.type !== 'submit' && el.type !== 'image') {
        if (el.value != null) field.value = String(el.value).substring(0, 200);
      }
      if (el.type !== 'submit' && el.type !== 'button' && el.type !== 'image') inputs.push(field);
    });
    forms.push({
      index: idx,
      action: action.startsWith('http') ? action : new URL(action, pageUrl).href,
      method,
      enctype: form.enctype || 'application/x-www-form-urlencoded',
      inputs,
    });
  });
  const links = [];
  document.querySelectorAll('a[href]').forEach((a) => {
    let href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    try {
      const full = new URL(href, pageUrl).href;
      const sameOrigin = new URL(full).origin === base.origin;
      links.push({
        href: full,
        text: (a.textContent || '').trim().substring(0, 100),
        sameOrigin,
      });
    } catch (_) {}
  });
  return { forms, links };
}

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
    await page.goto(url, { waitUntil: 'networkidle0', timeout: TIMEOUT_MS });
    await new Promise((r) => setTimeout(r, WAIT_AFTER_LOAD_MS));

    const { forms, links } = await page.evaluate(extractFormsAndLinks, page.url());
    const cookies = await page.cookies();

    const summary = {
      target: url,
      finalUrl: page.url(),
      forms: {
        count: forms.length,
        list: forms,
      },
      links: {
        count: links.length,
        sameOrigin: links.filter((l) => l.sameOrigin),
        all: links.map((l) => ({ href: l.href, text: l.text })),
      },
      cookies: cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path })),
      requests: {
        count: requests.length,
        list: requests.map((r) => ({
          url: r.url,
          method: r.method,
          resourceType: r.resourceType,
          responseStatus: r.responseStatus,
          postData: r.postData ? r.postData.substring(0, 500) : undefined,
        })),
      },
    };
    process.stdout.write(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(String(err.message || err) + '\n');
  process.exit(1);
});
