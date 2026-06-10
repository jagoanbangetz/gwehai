# OOB Detector — Integration Guide

## Overview

Burp Collaborator-style Out-of-Band (OOB) callback detection for blind vulnerabilities:
- **Blind SQLi** (MySQL, MSSQL, Oracle, PostgreSQL)
- **Blind XXE** (external entity callback)
- **SSRF** (redirect to callback server)
- **Command Injection** (ping, nslookup, curl)

## Architecture

```
Agent calls oob_test tool
    → Creates unique callback subdomain: TESTID.callback.gweh.sh
    → Agent injects payload into target
    → DNS server (UDP 5353) / HTTP server (8825) receives callback
    → OobDetectorService processes callback, updates DB
    → SSE event pushed to frontend
    → Agent gets confirmed finding with confidence score
```

## Files Created

| File | Purpose |
|------|---------|
| `src/entities/oob-log.entity.ts` | TypeORM entity for `oob_logs` table |
| `src/tools/oob-detector.service.ts` | Core service: DNS + HTTP servers, callback processing, payload templates |
| `src/tools/oob-detector.module.ts` | NestJS module |
| `src/tools/oob-detector.service.spec.ts` | Unit tests |
| `src/migrations/create_oob_logs.sql` | PostgreSQL migration |

## Files Modified

| File | Change |
|------|--------|
| `src/prompt/pentest-tools.def.ts` | Added `oob_test` tool definition |
| `src/chat/tool-executor.service.ts` | Added `oob_test` handler + OobDetectorService injection |
| `src/tools/tools.module.ts` | Import + export OobDetectorModule |
| `src/chat/chat.module.ts` | Import OobDetectorModule |

## Environment Variables

```bash
OOB_CALLBACK_DOMAIN=callback.gweh.sh   # Base callback domain
OOB_DNS_PORT=5353                       # DNS server port (non-privileged)
OOB_HTTP_PORT=8825                      # HTTP callback server port
OOB_MAX_PENDING=50                      # Max concurrent pending tests
OOB_DEFAULT_TIMEOUT_MS=30000            # Default timeout (30s)
```

## DNS Setup (Production)

```
NS record: callback.gweh.sh → server IP
Wildcard:  *.callback.gweh.sh → same server
```

For local dev, the DNS server listens on port 5353 (non-privileged).

## Tool API

### `oob_test` Actions

| Action | Args | Description |
|--------|------|-------------|
| `create` | payload_type, target_url, vuln_type, template_id, timeout_ms | Create new OOB test |
| `status` | test_id | Get callback status |
| `wait` | test_id, wait_ms | Long-poll for callback |
| `cancel` | test_id | Cancel pending test |
| `templates` | vuln_type | List payload templates |
| `list` | limit | List recent tests |

### Confidence Scoring

| Callback Type | Confidence |
|---------------|------------|
| DNS only | 85 |
| HTTP only | 90 |
| DNS + HTTP | 95 |
| Multiple callbacks | 95+ |

### Payload Templates

| ID | Vuln Type | DB/Type |
|----|-----------|---------|
| sqli_dns_mysql | SQLi | MySQL (DNS) |
| sqli_dns_mssql | SQLi | MSSQL (DNS) |
| sqli_dns_oracle | SQLi | Oracle (DNS) |
| sqli_dns_pg | SQLi | PostgreSQL (DNS) |
| sqli_http_mysql | SQLi | MySQL (HTTP) |
| sqli_http_mssql | SQLi | MSSQL (HTTP) |
| sqli_http_oracle | SQLi | Oracle (HTTP) |
| sqli_http_pg | SQLi | PostgreSQL (HTTP) |
| xxe_dns | XXE | External entity |
| xxe_file | XXE | File read |
| ssrf_http | SSRF | HTTP redirect |
| ssrf_dns | SSRF | DNS callback |
| cmdi_ping | CMDI | Ping |
| cmdi_nslookup | CMDI | Nslookup |
| cmdi_curl | CMDI | Curl subshell |

## Agent Flow Example

```
1. oob_test(action=create, vuln_type=sqli, template_id=sqli_dns_mysql, target_url=https://target.com/search?q=test)
   → Returns: { testId, callbackDomain, payloadTemplate }

2. exec(command="curl 'https://target.com/search?q=<payloadTemplate>'")
   → Injects payload with callback URL

3. oob_test(action=wait, test_id=<testId>)
   → Waits for DNS/HTTP callback
   → Returns: { status: "received", confidence: 85 }

4. report_finding(detail="Blind SQLi via DNS callback", confidence=85, ...)
```
