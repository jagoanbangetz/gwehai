import { ConfigService } from '@nestjs/config';
import { AttackChainService } from '../../src/attack-chain/attack-chain.service';
import { CHAIN_SAFETY } from '../../src/attack-chain/attack-chain.types';

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('AttackChainService', () => {
  let service: AttackChainService;
  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AttackChainService(configService);
    mockFetch.mockReset();
  });

  describe('listChains', () => {
    it('should return all built-in chains', () => {
      const chains = service.listChains();
      expect(chains.length).toBeGreaterThanOrEqual(5);
      expect(chains.map((c) => c.name)).toEqual(
        expect.arrayContaining(['csrf_bypass', 'auth_escalation', 'idor_enumeration', 'file_upload_rce', 'password_reset_poisoning']),
      );
    });

    it('should include category and tags for each chain', () => {
      const chains = service.listChains();
      for (const chain of chains) {
        expect(chain.name).toBeDefined();
        expect(chain.description).toBeDefined();
        expect(chain.category).toBeDefined();
        expect(Array.isArray(chain.tags)).toBe(true);
      }
    });
  });

  describe('getChain', () => {
    it('should return a chain by name', () => {
      const chain = service.getChain('csrf_bypass');
      expect(chain).toBeDefined();
      expect(chain!.name).toBe('csrf_bypass');
      expect(chain!.steps.length).toBeGreaterThan(0);
    });

    it('should return undefined for unknown chain', () => {
      const chain = service.getChain('nonexistent_chain');
      expect(chain).toBeUndefined();
    });
  });

  describe('runChain', () => {
    it('should return error when chain not found', async () => {
      const result = await service.runChain({
        chainName: 'nonexistent',
        targetUrl: 'https://example.com',
      });
      expect(result.status).toBe('error');
      expect(result.summary).toContain('Chain not found');
    });

    it('should fail when target_url is empty', async () => {
      const result = await service.runChain({
        chainName: 'csrf_bypass',
        targetUrl: '',
      });
      expect(result.status).toBe('failed');
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps[0].status).toBe('error');
    });

    it('should abort when approval required but not given', async () => {
      const result = await service.runChain({
        chainName: 'file_upload_rce',
        targetUrl: 'https://example.com',
        variables: { upload_url: 'https://example.com/upload' },
      });
      expect(result.status).toBe('aborted');
      expect(result.approvalObtained).toBe(false);
    });

    it('should run a simple custom chain', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('<html>OK</html>'),
      });

      const result = await service.runChain({
        targetUrl: 'https://example.com',
        steps: [
          {
            id: 'step1',
            type: 'request',
            method: 'GET',
            url: '{{target_url}}',
          },
        ],
      });

      expect(result.status).toBe('completed');
      expect(result.steps.length).toBe(1);
      expect(result.steps[0].status).toBe('success');
      expect(result.steps[0].statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should extract variables from response', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('<input name="csrf_token" value="abc123">'),
      });

      const result = await service.runChain({
        targetUrl: 'https://example.com',
        steps: [
          {
            id: 'fetch',
            type: 'request',
            method: 'GET',
            url: '{{target_url}}',
          },
          {
            id: 'extract',
            type: 'extract',
            pattern: 'value="([^"]+)"',
            from: 'body',
            variable: 'token',
          },
        ],
      });

      expect(result.status).toBe('completed');
      expect(result.variables['token']).toBe('abc123');
      expect(result.steps[1].extractedValue).toBe('abc123');
    });

    it('should pass assertions when condition met', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"data": "secret"}'),
      });

      const result = await service.runChain({
        targetUrl: 'https://example.com',
        steps: [
          {
            id: 'req',
            type: 'request',
            method: 'GET',
            url: '{{target_url}}',
          },
          {
            id: 'assert',
            type: 'assert',
            condition: 'contains',
            expected: 'secret',
          },
        ],
      });

      expect(result.steps[1].status).toBe('success');
      expect(result.steps[1].assertResult).toBe(true);
    });

    it('should fail assertion when condition not met', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      });

      const result = await service.runChain({
        targetUrl: 'https://example.com',
        steps: [
          {
            id: 'req',
            type: 'request',
            method: 'GET',
            url: '{{target_url}}',
          },
          {
            id: 'assert',
            type: 'assert',
            condition: 'status',
            expected: '200',
            abortOnFail: true,
          },
        ],
      });

      expect(result.steps[1].status).toBe('error');
      expect(result.steps[1].assertResult).toBe(false);
    });

    it('should enforce max steps safety limit', async () => {
      const steps = Array.from({ length: 11 }, (_, i) => ({
        id: `step_${i}`,
        type: 'request' as const,
        method: 'GET',
        url: '{{target_url}}',
      }));

      const result = await service.runChain({
        targetUrl: 'https://example.com',
        steps,
      });

      expect(result.status).toBe('error');
      expect(result.summary).toContain('max');
    });

    it('should interpolate variables in URL and headers', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('OK'),
      });

      await service.runChain({
        targetUrl: 'https://example.com',
        variables: { path: 'api/v1', auth: 'Bearer mytoken' },
        steps: [
          {
            id: 'req',
            type: 'request',
            method: 'GET',
            url: '{{target_url}}/{{path}}',
            headers: {
              Authorization: '{{auth}}',
            },
          },
        ],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/v1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mytoken',
          }),
        }),
      );
    });

    it('should handle request timeout', async () => {
      mockFetch.mockImplementationOnce(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      const result = await service.runChain({
        targetUrl: 'https://example.com',
        steps: [
          {
            id: 'slow',
            type: 'request',
            method: 'GET',
            url: '{{target_url}}',
            timeoutMs: 1000,
          },
        ],
      });

      expect(result.steps[0].status).toBe('error');
      expect(result.steps[0].error).toContain('timed out');
    });

    it('should run csrf_bypass built-in chain', async () => {
      // Step 1: fetch page with CSRF token
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('<form><input name="csrf_token" value="token_abc"></form>'),
      });
      // Step 4: forged request
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"deleted": true}'),
      });

      const result = await service.runChain({
        chainName: 'csrf_bypass',
        targetUrl: 'https://example.com',
      });

      expect(result.chainName).toBe('csrf_bypass');
      expect(result.status).toBe('completed');
      expect(result.variables['csrf_token']).toBe('token_abc');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should run auth_escalation built-in chain', async () => {
      // Step 1: login
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"token": "session_xyz"}'),
      });
      // Step 4: access admin
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"users": []}'),
      });

      const result = await service.runChain({
        chainName: 'auth_escalation',
        targetUrl: 'https://example.com',
        variables: {
          login_url: 'https://example.com/login',
          admin_url: 'https://example.com/admin',
          username: 'test',
          password: 'test',
        },
      });

      expect(result.chainName).toBe('auth_escalation');
      expect(result.variables['session_token']).toBe('session_xyz');
    });

    it('should support custom default headers', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('OK'),
      });

      await service.runChain({
        targetUrl: 'https://example.com',
        defaultHeaders: { 'X-Custom': 'value' },
        steps: [
          {
            id: 'req',
            type: 'request',
            method: 'GET',
            url: '{{target_url}}',
          },
        ],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'value',
          }),
        }),
      );
    });

    it('should mark exploitable when all asserts pass and requests succeed', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('{"admin": true}'),
      });

      const result = await service.runChain({
        targetUrl: 'https://example.com',
        steps: [
          {
            id: 'req',
            type: 'request',
            method: 'GET',
            url: '{{target_url}}/admin',
          },
          {
            id: 'assert',
            type: 'assert',
            condition: 'status',
            expected: '200',
          },
        ],
      });

      expect(result.exploitable).toBe(true);
      expect(result.finding).toBeDefined();
      expect(result.finding!.title).toBeDefined();
      expect(result.finding!.poc).toBeDefined();
    });

    it('should handle use step for variable injection', async () => {
      const result = await service.runChain({
        targetUrl: 'https://example.com',
        variables: { mytoken: 'abc123' },
        steps: [
          {
            id: 'inject',
            type: 'use',
            injectVariable: 'mytoken',
            injectTarget: 'header',
            injectKey: 'Authorization',
          },
        ],
      });

      expect(result.steps[0].status).toBe('success');
      expect(result.variables['__inject_Authorization']).toBe('abc123');
    });

    it('should handle delay step', async () => {
      const start = Date.now();
      const result = await service.runChain({
        targetUrl: 'https://example.com',
        steps: [
          {
            id: 'wait',
            type: 'delay',
            delayMs: 100,
          },
        ],
      });
      const elapsed = Date.now() - start;

      expect(result.steps[0].status).toBe('success');
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });
});
