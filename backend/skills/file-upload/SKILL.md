---
name: file-upload
description: "File upload — type/extension/content bypass, path traversal in filename, stored XSS via filename. PoC only; report_finding with upload request + response/access evidence."
---

# File Upload Skill

## Purpose

Test file upload functionality for: (1) type/extension/content-type bypass (upload executable or script), (2) path traversal in filename (e.g. ../../../etc/passwd), (3) stored XSS via filename or content. PoC only; no malware, no overwrite of real files; safe filenames and content.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search**(query: target + "file upload" or "upload") — avoid re-testing.
- **memory_get**(path: "SCOPE.md") to confirm scope.
- Identify upload endpoints and allowed types from recon (e.g. /upload, /avatar, /import).

## Inputs

- **target URL** (base URL and upload endpoint).
- **Optional**: session cookies for authenticated upload.
- **Optional**: allowed MIME types/extensions from recon (e.g. image/jpeg, .jpg).

## Workflow

### THINK

- Where are files uploaded? What extensions/MIME types are accepted? Is there client-side and server-side validation?
- Already tested (memory_search)? Retest only new endpoints or if user asked.
- Is target in SCOPE? PoC file content harmless (e.g. minimal image or plain text); no executable payload.

### ACT

1. **memory_search**(query: target + "file upload", max_results: 10).
2. **Extension bypass**: **exec**(curl -F "file=@test.php;type=image/jpeg" URL) or **craft_payload** to upload with double extension (e.g. .jpg.php) or null byte if applicable; check response and access URL. **report_finding** if script executed or wrong type accepted.
3. **Path traversal in filename**: **exec**(curl -F "file=@safe.txt;filename=../../../var/www/uploaded.txt" URL); check if file written to unexpected path (only if scope allows and path is test-safe). **report_finding** if path traversal confirmed.
4. **Stored XSS**: Upload with filename or content containing safe payload (e.g. alert(1)); **exec**(curl) to retrieve or list; check if reflected unescaped. **report_finding** if XSS confirmed.
5. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: File upload — Extension: []; Path: []; XSS: []. Tested vectors: [list].").

### OBSERVE

- Response (200, file URL, error); Content-Type accepted; actual file location and extension; retrieval response (XSS).

### REFLECT

- Is proof in poc (upload request + response + access/retrieval showing bypass or XSS)? If not, do not mark done.
- Only safe PoC files (no real malware, no overwrite of critical paths).

### LOG

- **write_file**: "Tested vectors: [endpoint, vector type, payload, result]. Checklist progress: File upload — done."
- **report_finding** for every confirmed upload flaw before marking phase done.

## Confirmation criteria

- **Extension/type bypass**: Server stores and serves file with executable/script extension or wrong MIME; or script executes when accessed.
- **Path traversal**: File written outside intended directory (only report if scope allows and PoC path is safe).
- **XSS**: Filename or file content reflected unescaped when file is viewed or listed.

## Proof requirements

- **poc**: Upload request (filename, Content-Type, body if relevant) + response (status, file URL) + access proof (curl to file URL or response snippet showing execution/reflection).
- **evidence**: Response snippet or HAR; for XSS include response body showing unescaped payload.

## Tool calls guidance

- **exec**: `curl -s -F "file=@test.jpg;type=image/jpeg" -b cookies.txt "https://target.com/upload"` — then `curl -s "https://target.com/uploads/returned_path"`.
- **craft_payload**: Create minimal test file (e.g. 1x1 gif or txt with safe XSS string); use in upload. 30s max.
- **write_file**: Path main or daily/website/YYYY-MM-DD; append "Tested vectors" and "Checklist progress".

## Safety limits

- **Stop**: 429, WAF, or size limit; log and continue. **No malware**: only safe test files (e.g. .txt with "test", minimal image). **No overwrite**: use unique filename or path allowed by app.
- **In-scope only**.

## Output fields for report_finding

- **title**: `File upload — [issue]` (e.g. "File upload — Extension bypass allows .php").
- **severity**: high/critical for RCE or path traversal; medium for type bypass; low for XSS in filename only.
- **target**: Upload endpoint URL.
- **description**: Issue type, validation bypass, impact, steps to reproduce.
- **poc**: Upload request + response + access/retrieval proof.
- **evidence**: Response snippet or HAR; file URL and retrieval response.
