import * as crypto from 'crypto';
import { JwtAnalyzerService } from '../../src/tools/jwt-analyzer.service';

/**
 * Helper: create a valid JWT with HMAC-SHA256 signing.
 */
function signJwt(header: Record<string, any>, payload: Record<string, any>, secret: string): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Helper: create a valid JWT with RSA-SHA256 signing.
 */
function signJwtRSA(header: Record<string, any>, payload: Record<string, any>, privateKey: string): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${h}.${p}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data);
  const sig = sign.sign(privateKey, 'base64url');
  return `${data}.${sig}`;
}

describe('JwtAnalyzerService', () => {
  let service: JwtAnalyzerService;

  beforeEach(() => {
    service = new JwtAnalyzerService();
  });

  describe('analyze — basic decoding', () => {
    it('should decode a valid HS256 JWT', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
        'secret',
      );

      const result = await service.analyze(token);

      expect(result.algorithm).toBe('HS256');
      expect(result.payload.sub).toBe('user123');
      expect(result.payload.role).toBe('admin');
      expect(result.header.typ).toBe('JWT');
      expect(result.key_id).toBeNull();
      expect(result.is_expired).toBe(false);
    });

    it('should strip Bearer prefix', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(`Bearer ${token}`);
      expect(result.payload.sub).toBe('user123');
    });

    it('should detect expired token', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', exp: Math.floor(Date.now() / 1000) - 3600 },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.is_expired).toBe(true);
    });

    it('should throw on invalid JWT format', async () => {
      await expect(service.analyze('not.a.jwt.token')).rejects.toThrow('Invalid JWT format');
    });

    it('should throw on two-part token', async () => {
      await expect(service.analyze('header.payload')).rejects.toThrow('Invalid JWT format');
    });
  });

  describe('analyze — algorithm none detection', () => {
    it('should detect alg=none in header', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(token);
      const algNoneAttack = result.attacks.find(a => a.attack_type === 'alg_none');
      expect(algNoneAttack).toBeDefined();
      expect(algNoneAttack!.test_token).toBeDefined();
      expect(algNoneAttack!.test_token).toContain('.');

      // Verify the test token has alg=none
      const testHeader = JSON.parse(
        Buffer.from(algNoneAttack!.test_token!.split('.')[0], 'base64url').toString(),
      );
      expect(testHeader.alg).toBe('none');
    });
  });

  describe('analyze — weak HMAC detection', () => {
    it('should find weak secret "secret"', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', role: 'admin' },
        'secret',
      );

      const result = await service.analyze(token);
      const hmacAttack = result.attacks.find(a => a.attack_type === 'weak_hmac');
      expect(hmacAttack).toBeDefined();
      expect(hmacAttack!.vulnerable).toBe(true);
      expect(hmacAttack!.secret_found).toBe('secret');
      expect(hmacAttack!.severity).toBe('critical');
    });

    it('should find weak secret "password"', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123' },
        'password',
      );

      const result = await service.analyze(token);
      const hmacAttack = result.attacks.find(a => a.attack_type === 'weak_hmac');
      expect(hmacAttack!.vulnerable).toBe(true);
      expect(hmacAttack!.secret_found).toBe('password');
    });

    it('should NOT find strong secret', async () => {
      const strongSecret = crypto.randomBytes(32).toString('hex');
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123' },
        strongSecret,
      );

      const result = await service.analyze(token);
      const hmacAttack = result.attacks.find(a => a.attack_type === 'weak_hmac');
      expect(hmacAttack!.vulnerable).toBe(false);
      expect(hmacAttack!.secret_found).toBeUndefined();
    });

    it('should skip HMAC test for RS256 tokens', async () => {
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const token = signJwtRSA(
        { alg: 'RS256', typ: 'JWT' },
        { sub: 'user123' },
        privateKey,
      );

      const result = await service.analyze(token);
      const hmacAttack = result.attacks.find(a => a.attack_type === 'weak_hmac');
      expect(hmacAttack!.details).toContain('Skipped');
    });
  });

  describe('analyze — key confusion detection', () => {
    it('should generate key confusion test for RS256', async () => {
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const token = signJwtRSA(
        { alg: 'RS256', typ: 'JWT' },
        { sub: 'user123' },
        privateKey,
      );

      const result = await service.analyze(token);
      const kcAttack = result.attacks.find(a => a.attack_type === 'key_confusion');
      expect(kcAttack).toBeDefined();
      expect(kcAttack!.details).toContain('RS256');
      expect(kcAttack!.test_token).toBeDefined();
    });

    it('should skip key confusion for HS256', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(token);
      const kcAttack = result.attacks.find(a => a.attack_type === 'key_confusion');
      expect(kcAttack!.details).toContain('Skipped');
    });
  });

  describe('analyze — JWK injection', () => {
    it('should generate JWK injection test token', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(token);
      const jwkAttack = result.attacks.find(a => a.attack_type === 'jwk_injection');
      expect(jwkAttack).toBeDefined();
      expect(jwkAttack!.test_token).toBeDefined();

      // Verify the test token has a JWK in header
      const testHeader = JSON.parse(
        Buffer.from(jwkAttack!.test_token!.split('.')[0], 'base64url').toString(),
      );
      expect(testHeader.jwk).toBeDefined();
      expect(testHeader.jwk.kty).toBe('RSA');
      expect(testHeader.alg).toBe('RS256');
    });

    it('should flag existing JWK in header', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT', jwk: { kty: 'RSA', n: 'test', e: 'AQAB' } },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.security_issues.some(i => i.includes('JWK embedded'))).toBe(true);
    });
  });

  describe('analyze — kid injection', () => {
    it('should detect path traversal in kid', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT', kid: '../../../etc/passwd' },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.security_issues.some(i => i.includes('path traversal'))).toBe(true);
      const kidAttack = result.attacks.find(a => a.attack_type === 'kid_injection');
      expect(kidAttack!.vulnerable).toBe(true);
    });

    it('should detect /dev/null kid', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT', kid: '/dev/null' },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.security_issues.some(i => i.includes('special file'))).toBe(true);
    });

    it('should generate kid injection test with /dev/null', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT', kid: 'normal-key-id' },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(token);
      const kidAttack = result.attacks.find(a => a.attack_type === 'kid_injection');
      expect(kidAttack!.test_token).toBeDefined();

      const testHeader = JSON.parse(
        Buffer.from(kidAttack!.test_token!.split('.')[0], 'base64url').toString(),
      );
      expect(testHeader.kid).toBe('/dev/null');
    });
  });

  describe('analyze — expiry bypass', () => {
    it('should generate extended expiry test token', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', exp: Math.floor(Date.now() / 1000) + 3600 },
        'secret',
      );

      const result = await service.analyze(token);
      const expAttack = result.attacks.find(a => a.attack_type === 'expiry_bypass');
      expect(expAttack).toBeDefined();
      expect(expAttack!.test_token).toBeDefined();
      expect(expAttack!.details).toContain('Modified to');
    });

    it('should handle tokens without exp', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.security_issues.some(i => i.includes('never expires'))).toBe(true);
      const expAttack = result.attacks.find(a => a.attack_type === 'expiry_bypass');
      expect(expAttack!.details).toContain('no exp claim');
    });
  });

  describe('analyze — sensitive data detection', () => {
    it('should detect email in payload', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', email: 'admin@example.com' },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.sensitive_data.some(s => s.type === 'email')).toBe(true);
    });

    it('should detect password field in payload', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', password: 'hunter2' },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.sensitive_data.some(s => s.type === 'password')).toBe(true);
      expect(result.sensitive_data.some(s => s.severity === 'high')).toBe(true);
    });

    it('should detect credit card pattern', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', cc: '4111-1111-1111-1111' },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.sensitive_data.some(s => s.type === 'credit_card')).toBe(true);
      expect(result.sensitive_data.some(s => s.severity === 'critical')).toBe(true);
    });

    it('should detect admin claims', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', admin: true },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.security_issues.some(i => i.includes('Admin privileges'))).toBe(true);
    });
  });

  describe('analyze — risk level calculation', () => {
    it('should be critical when weak HMAC secret found', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.risk_level).toBe('critical');
      expect(result.exploitable_attacks).toBeGreaterThanOrEqual(1);
    });

    it('should be low/info for strong HMAC with no issues', async () => {
      const strongSecret = crypto.randomBytes(32).toString('hex');
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', exp: Math.floor(Date.now() / 1000) + 3600 },
        strongSecret,
      );

      const result = await service.analyze(token);
      expect(['low', 'info', 'medium']).toContain(result.risk_level);
    });

    it('should be high when JWK injection header present', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT', jwk: { kty: 'RSA', n: 'test', e: 'AQAB' } },
        { sub: 'user123' },
        'secret',
      );

      const result = await service.analyze(token);
      // Critical because JWK is embedded AND weak secret
      expect(result.risk_level).toBe('critical');
    });
  });

  describe('analyze — claims extraction', () => {
    it('should separate standard and custom claims', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', iss: 'test-issuer', custom_field: 'value', role: 'admin' },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.claims.sub).toBe('user123');
      expect(result.claims.iss).toBe('test-issuer');
      expect(result.claims['custom:custom_field']).toBe('value');
      expect(result.claims['custom:role']).toBe('admin');
    });
  });

  describe('analyze — attack count', () => {
    it('should run all 6 attack tests', async () => {
      const token = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'user123', exp: Math.floor(Date.now() / 1000) + 3600 },
        'secret',
      );

      const result = await service.analyze(token);
      expect(result.total_attacks_tested).toBe(6);
      expect(result.attacks.map(a => a.attack_type).sort()).toEqual([
        'alg_none', 'expiry_bypass', 'jwk_injection', 'key_confusion', 'kid_injection', 'weak_hmac',
      ]);
    });
  });
});
