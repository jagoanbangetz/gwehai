#!/usr/bin/env bash
# ============================================================================
# PRODUCTION READINESS CHECKLIST — GwehAI / Galerz Group
# ============================================================================
# Usage: ./check-prod-readiness.sh
#
# Read-only verification. No install, no side effects.
# Exit 0 = all checks pass. Exit 1 = one or more checks fail.
#
# Sections:
#   1. TOOLS (17+ pentest tools)
#   2. BROWSER (Chromium, Playwright, Puppeteer)
#   3. SKILLS (36 SKILL.md files + index docs)
#   4. DATA (nuclei templates, wordlists, exploit-db)
#   5. SERVICES (containers, backend, frontend)
#   6. HACKTIVITY (endpoint health, entry quality)
# ============================================================================

set -o pipefail

# ─── Color helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

PASS="${GREEN}PASS${NC}"
FAIL="${RED}FAIL${NC}"
WARN="${YELLOW}WARN${NC}"

FAIL_COUNT=0
PASS_COUNT=0
WARN_COUNT=0

# ─── Helpers ─────────────────────────────────────────────────────────────────
check_pass() { printf "  ${GREEN}\xE2\x9C\x93${NC} %s\n" "$1"; ((PASS_COUNT++)); }
check_fail() { printf "  ${RED}\xE2\x9C\x97${NC} %s\n" "$1"; ((FAIL_COUNT++)); }
check_warn() { printf "  ${YELLOW}\xE2\x9A\xA0${NC} %s\n" "$1"; ((WARN_COUNT++)); }

header() {
    echo ""
    printf "${BOLD}${CYAN}━━━ %s ━━━${NC}\n" "$1"
}

# Check binary — try host first, then docker
check_tool() {
    local tool="$1"
    local label="${2:-$tool}"

    # Try host
    if command -v "$tool" &>/dev/null; then
        check_pass "$label — $(command -v "$tool")"
        return 0
    fi

    # Try docker (only if container is running)
    if docker exec gwehai-pentest-tools which "$tool" &>/dev/null 2>&1; then
        check_pass "$label — docker://gwehai-pentest-tools"
        return 0
    fi

    check_fail "$label — NOT FOUND (host + docker)"
    return 1
}

# Check binary in docker only
check_tool_docker() {
    local tool="$1"
    local label="${2:-$tool}"

    if docker exec gwehai-pentest-tools which "$tool" &>/dev/null 2>&1; then
        check_pass "$label — docker://gwehai-pentest-tools"
        return 0
    fi
    check_fail "$label — NOT FOUND in docker"
    return 1
}

# Check file exists (host path)
check_file() {
    local path="$1"
    local label="${2:-$path}"

    if [ -f "$path" ]; then
        check_pass "$label — $path"
        return 0
    fi
    check_fail "$label — missing: $path"
    return 1
}

# Check directory exists + optional count
check_dir() {
    local path="$1"
    local label="${2:-$path}"

    if [ ! -d "$path" ]; then
        check_fail "$label — dir missing: $path"
        return 1
    fi

    local count=$(find "$path" -maxdepth 1 -type f 2>/dev/null | wc -l)
    check_pass "$label — $count files ($path)"
    return 0
}

# Check HTTP endpoint (use HTTPS with -k for self-signed certs)
check_http() {
    local url="$1"
    local label="${2:-$url}"
    local expected="${3:-200}"

    local code
    code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null)
    if [ "$code" = "$expected" ]; then
        check_pass "$label — HTTP $code"
        return 0
    else
        check_fail "$label — expected HTTP $expected, got ${code:-timeout}"
        return 1
    fi
}

# Check HTTP with any success range (2xx/3xx)
check_http_any() {
    local url="$1"
    local label="${2:-$url}"

    local code
    code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null)
    if [ -n "$code" ] && [ "$code" -ge 200 ] 2>/dev/null && [ "$code" -lt 400 ] 2>/dev/null; then
        check_pass "$label — HTTP $code"
        return 0
    else
        check_fail "$label — got HTTP ${code:-timeout}, expected 2xx/3xx"
        return 1
    fi
}

# ─── Pre-flight ──────────────────────────────────────────────────────────────
echo ""
printf "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${NC}\n"
printf "${BOLD}${CYAN}║   GWEHAI PRODUCTION READINESS CHECKLIST             ║${NC}\n"
printf "${BOLD}${CYAN}║   $(date '+%Y-%m-%d %H:%M:%S %Z')                          ║${NC}\n"
printf "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${NC}\n"

DOCKER_RUNNING=false
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'gwehai-pentest-tools'; then
    DOCKER_RUNNING=true
fi

# =============================================================================
# SECTION 1: TOOLS (17+ items)
# =============================================================================
header "SECTION 1: PENTEST TOOLS"

echo ""
echo "  ── Network / Recon ──"
check_tool "nmap"      "nmap"
check_tool "masscan"   "masscan"
check_tool "dig"       "dig"
check_tool "whois"     "whois"
check_tool "curl"      "curl"
check_tool "rg"        "rg (ripgrep)"
check_tool "subfinder" "subfinder"
# Check httpx specially — need the Go ProjectDiscovery version, not Python httpx
check_tool_httpx() {
    # Try host first — but verify it's the Go tool, not the Python library
    if HOST_HTTPX=$(command -v httpx 2>/dev/null); then
        # Verify: Go httpx responds to -version, Python httpx does not
        if httpx -version &>/dev/null 2>&1; then
            check_pass "httpx (Go) — $HOST_HTTPX"
            return 0
        fi
    fi
    # Try docker
    if docker exec gwehai-pentest-tools httpx -version &>/dev/null 2>&1; then
        check_pass "httpx (Go) — docker://gwehai-pentest-tools"
        return 0
    fi
    check_fail "httpx (Go) — NOT FOUND (host + docker)"
    return 1
}
check_tool_httpx
check_tool "naabu"     "naabu"

echo ""
echo "  ── Scanners / Fuzzers ──"
check_tool "nuclei"    "nuclei"
check_tool "ffuf"      "ffuf"
check_tool "nikto"     "nikto"

echo ""
echo "  ── Exploit / Attack ──"
check_tool "sqlmap"        "sqlmap"
check_tool "sslyze"        "sslyze"
check_tool "git-dumper"    "git-dumper"
check_tool "theHarvester"  "theHarvester"
check_tool "john"          "john (John the Ripper)"

echo ""
echo "  ── Exploit DB ──"
check_tool "searchsploit"  "searchsploit"

# =============================================================================
# SECTION 2: BROWSER
# =============================================================================
header "SECTION 2: BROWSER / AUTOMATION"

echo ""
echo "  ── Chromium Binary ──"
CHROMIUM_FOUND=false
for chromepath in /usr/bin/chromium /usr/bin/chromium-browser /snap/bin/chromium; do
    if [ -f "$chromepath" ]; then
        check_pass "Chromium binary — $chromepath"
        CHROMIUM_FOUND=true
        break
    fi
done
# Also check in docker
if ! $CHROMIUM_FOUND; then
    if docker exec gwehai-pentest-tools test -f /usr/bin/chromium 2>/dev/null; then
        check_pass "Chromium binary — docker://gwehai-pentest-tools:/usr/bin/chromium"
        CHROMIUM_FOUND=true
    fi
fi
if ! $CHROMIUM_FOUND; then
    check_warn "Chromium binary — not found at standard paths (Playwright may have its own)"
fi

echo ""
echo "  ── Playwright ──"
if npx playwright --version &>/dev/null 2>&1; then
    pwver=$(npx playwright --version 2>/dev/null)
    check_pass "Playwright installed — $pwver"
else
    check_fail "Playwright — NOT installed"
fi

# Playwright Chromium
PLAYWRIGHT_CHROMIUM_OK=false
# Check common cache locations
for pwbrowser in \
    "$HOME/.cache/ms-playwright/chromium-*/chrome-linux64/chrome" \
    "$HOME/.hermes/profiles/devops/home/.cache/ms-playwright/chromium-*/chrome-linux64/chrome" \
    "/home/g/.cache/ms-playwright/chromium-*/chrome-linux64/chrome"; do
    if ls $pwbrowser &>/dev/null 2>&1; then
        check_pass "Playwright Chromium — $(ls $pwbrowser 2>/dev/null | head -1)"
        PLAYWRIGHT_CHROMIUM_OK=true
        break
    fi
done
if ! $PLAYWRIGHT_CHROMIUM_OK; then
    check_warn "Playwright Chromium — not found in cache (may need: npx playwright install chromium)"
fi

echo ""
echo "  ── Puppeteer Scripts ──"
check_file "/home/g/gwehai/backend/skills/browser/capture-requests.js" "capture-requests.js"

# Check in docker too (separate from host mount)
if docker exec gwehai-pentest-tools test -f /opt/browser/capture-requests.js 2>/dev/null; then
    check_pass "capture-requests.js — docker://gwehai-pentest-tools:/opt/browser/"
else
    check_warn "capture-requests.js — NOT in docker container (may be mounted via compose)"
fi

echo ""
echo "  ── Browser Smoke Test ──"
BROWSER_TEST_OK=false
# Try puppeteer in docker
if docker exec gwehai-pentest-tools node /opt/browser/capture-requests.js https://httpbin.org/status/200 --timeout=15000 &>/dev/null 2>&1; then
    check_pass "Browser test — docker puppeteer → httpbin.org/status/200"
    BROWSER_TEST_OK=true
else
    # Try playwright on host
    PLAYWRIGHT_SCRIPT=$(mktemp /tmp/playwright-test-XXXXX.js)
    cat > "$PLAYWRIGHT_SCRIPT" << 'PLAYEOF'
const { chromium } = require('playwright');
(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const resp = await page.goto('https://httpbin.org/status/200', { timeout: 15000 });
    await browser.close();
    process.exit(resp.status() === 200 ? 0 : 1);
  } catch(e) { process.exit(1); }
})();
PLAYEOF
    if node "$PLAYWRIGHT_SCRIPT" &>/dev/null 2>&1; then
        check_pass "Browser test — playwright → httpbin.org/status/200"
        BROWSER_TEST_OK=true
    fi
    rm -f "$PLAYWRIGHT_SCRIPT"
fi
if ! $BROWSER_TEST_OK; then
    check_warn "Browser test — could not verify (puppeteer/playwright may need setup)"
fi

# =============================================================================
# SECTION 3: SKILLS
# =============================================================================
header "SECTION 3: SKILL FILES"

SKILLS_DIR="/home/g/gwehai/backend/skills"

# Count SKILL.md files
SKILL_COUNT=$(find "$SKILLS_DIR" -name "SKILL.md" -type f 2>/dev/null | wc -l)
if [ "$SKILL_COUNT" -ge 36 ]; then
    check_pass "SKILL.md files — $SKILL_COUNT found (expected ≥36)"
else
    check_fail "SKILL.md files — $SKILL_COUNT found (expected ≥36)"
fi

check_file "$SKILLS_DIR/WEB_CHECKLIST.md"     "WEB_CHECKLIST.md"
check_file "$SKILLS_DIR/SKILLS_INDEX.md"      "SKILLS_INDEX.md"
check_file "$SKILLS_DIR/CORE_ORCHESTRATOR.md" "CORE_ORCHESTRATOR.md"

# =============================================================================
# SECTION 4: DATA
# =============================================================================
header "SECTION 4: DATA / ASSETS"

echo ""
echo "  ── Nuclei Templates ──"
NUCLEI_COUNT=$(find /opt/nuclei-templates -name "*.yaml" -type f 2>/dev/null | wc -l)
if [ "$NUCLEI_COUNT" -gt 1000 ]; then
    check_pass "Nuclei templates — $NUCLEI_COUNT YAML files"
else
    check_fail "Nuclei templates — only $NUCLEI_COUNT YAML files (expected 1000+)"
fi

echo ""
echo "  ── Wordlists ──"
WORDLIST_COUNT=$(find /opt/wordlists -type f 2>/dev/null | wc -l)
if [ "$WORDLIST_COUNT" -ge 3 ]; then
    check_pass "Wordlists — $WORDLIST_COUNT files in /opt/wordlists"
else
    check_warn "Wordlists — $WORDLIST_COUNT files in /opt/wordlists"
fi

echo ""
echo "  ── Exploit-DB ──"
if docker exec gwehai-pentest-tools which searchsploit &>/dev/null 2>&1; then
    check_pass "Exploit-DB (searchsploit) — accessible in docker"
else
    check_fail "Exploit-DB (searchsploit) — NOT accessible"
fi

# =============================================================================
# SECTION 5: SERVICES
# =============================================================================
header "SECTION 5: SERVICES"

echo ""
echo "  ── Docker Containers ──"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'gwehai-pentest-tools'; then
    uptime=$(docker ps --format '{{.Status}}' --filter name=gwehai-pentest-tools)
    check_pass "gwehai-pentest-tools container — $uptime"
else
    check_fail "gwehai-pentest-tools container — NOT running"
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'gwehai-postgres'; then
    pg_uptime=$(docker ps --format '{{.Status}}' --filter name=gwehai-postgres)
    check_pass "gwehai-postgres container — $pg_uptime"
else
    check_fail "gwehai-postgres container — NOT running"
fi

echo ""
echo "  ── Backend API ──"
check_http "https://dev.gweh.sh/api/health" "Backend health" "200"

echo ""
echo "  ── Frontend ──"
check_http_any "https://dev.gweh.sh" "Frontend (dev.gweh.sh)"

# =============================================================================
# SECTION 6: HACKTIVITY
# =============================================================================
header "SECTION 6: HACKTIVITY FEED"

echo ""
HACKTIVITY_FILE=$(mktemp /tmp/hacktivity-check-XXXXX.json)
HACKTIVITY_CODE=$(curl -sk -o "$HACKTIVITY_FILE" -w "%{http_code}" --max-time 10 "https://dev.gweh.sh/api/hacktivity" 2>/dev/null)

if [ "$HACKTIVITY_CODE" = "200" ]; then
    check_pass "Hacktivity endpoint — HTTP 200"

    # Validate JSON & check for error noise using a temp python script
    _HACK_PY=$(mktemp /tmp/hacktivity-validate-XXXXX.py)
    cat > "$_HACK_PY" << 'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
if isinstance(data, list):
    print(f"entries:{len(data)}")
elif isinstance(data, dict):
    print(f"type:dict keys:{','.join(list(data.keys())[:5])}")
else:
    print("type:unknown")
# Error noise scan
with open(sys.argv[1]) as f:
    text = f.read().lower()
errors = sum(text.count(w) for w in ['error','exception','traceback','500','timeout'])
print(f"noise:{errors}")
PYEOF
    _HACK_OUTPUT=$(python3 "$_HACK_PY" "$HACKTIVITY_FILE" 2>/dev/null)
    _HACK_ENTRIES=$(echo "$_HACK_OUTPUT" | grep "^entries:" | cut -d: -f2)
    _HACK_NOISE=$(echo "$_HACK_OUTPUT" | grep "^noise:" | cut -d: -f2)

    if [ "${_HACK_NOISE:-0}" -eq 0 ]; then
        check_pass "Hacktivity entries — clean (no error noise)"
    else
        check_warn "Hacktivity entries — ${_HACK_NOISE} error keywords detected"
    fi
    rm -f "$_HACK_PY"
else
    # Non-200 — might need auth, check response body for clues
    RESP_BODY=$(head -c 200 "$HACKTIVITY_FILE" 2>/dev/null)
    if echo "$RESP_BODY" | grep -qi 'unauthorized\|Unauthorized'; then
        check_warn "Hacktivity endpoint — HTTP $HACKTIVITY_CODE (requires authentication)"
    else
        check_fail "Hacktivity endpoint — HTTP $HACKTIVITY_CODE (expected 200)"
    fi
fi
rm -f "$HACKTIVITY_FILE"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
printf "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "${BOLD}${CYAN}  SUMMARY${NC}\n"
printf "  ${GREEN}PASS: %d${NC}  ${RED}FAIL: %d${NC}  ${YELLOW}WARN: %d${NC}\n" "$PASS_COUNT" "$FAIL_COUNT" "$WARN_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
    printf "\n  ${RED}${BOLD}RESULT: NOT READY FOR PRODUCTION${NC}\n"
    printf "  ${RED}Fix %d failing check(s) before deploying.${NC}\n" "$FAIL_COUNT"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    printf "\n  ${YELLOW}${BOLD}RESULT: READY WITH WARNINGS${NC}\n"
    printf "  ${YELLOW}%d warning(s) — review before deploying.${NC}\n" "$WARN_COUNT"
    exit 0
else
    printf "\n  ${GREEN}${BOLD}RESULT: ALL CHECKS PASS — READY FOR PRODUCTION${NC}\n"
    exit 0
fi
