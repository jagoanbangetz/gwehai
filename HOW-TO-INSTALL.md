# 📦 GwehAI — How to Install

> Complete setup guide: from zero to production.
> AI-powered web application security assistant — automated pentesting, recon, vulnerability verification, and report generation.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start](#2-quick-start)
3. [Full Installation](#3-full-installation)
4. [Scripts Reference](#4-scripts-reference)
5. [Production Deployment](#5-production-deployment)
6. [Troubleshooting](#6-troubleshooting)
7. [Maintenance](#7-maintenance)

---

## 1. Prerequisites

> ⚠️ Pastikan semua requirement terpenuhi sebelum mulai install.

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | Ubuntu 20.04 / Debian 11 / macOS 12+ | Ubuntu 22.04+ |
| **Docker** | 20.10+ | 24.0+ |
| **Docker Compose** | v2.0+ | v2.20+ |
| **Node.js** | 18+ | 20 LTS |
| **npm** | 9+ | 10+ |
| **Git** | 2.30+ | latest |
| **RAM** | 4 GB | 8 GB+ |
| **Disk** | 20 GB free | 40 GB+ (pentest tools + DB) |
| **Python** | 3.8+ (opsional, untuk pip tools) | 3.10+ |

### 🔧 Install Prerequisites (Ubuntu/Debian)

```bash
# Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# ⚠️ Logout & login again after adding to docker group

# Node.js 20 LTS (via nvm — recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Git
sudo apt-get install -y git

# Verify
docker --version        # Docker version 24.0+
docker compose version  # Docker Compose version v2.20+
node --version           # v20.x.x
npm --version            # 10.x.x
git --version            # git version 2.30+
```

### 🔧 Install Prerequisites (macOS)

```bash
# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Docker Desktop — download from https://docker.com/products/docker-desktop

# Node.js
brew install node@20

# Git
brew install git
```

---

## 2. Quick Start

> 🚀 Untuk yang udah familiar. Butuh 5 menit.

```bash
# 1. Clone repo
git clone <REPO_URL> gwehai
cd gwehai

# 2. Setup environment
cp backend/env.sample backend/.env
# Edit backend/.env — set minimal: DB_*, JWT_SECRET, 1 LLM API key

# 3. Start database
docker compose up -d postgres

# 4. Run backend + frontend
./local.sh

# 5. (Optional) Start pentest tools container
docker compose up -d pentest-tools
```

**Akses:**
- 🌐 Frontend: http://localhost:5173
- 🔌 Backend API: http://localhost:3001

---

## 3. Full Installation

### Step 1 — Clone Repository

```bash
git clone <REPO_URL> gwehai
cd gwehai
```

### Step 2 — Environment Configuration

```bash
# Copy sample env
cp backend/env.sample backend/.env
```

Edit `backend/.env` — berikut variabel yang **wajib** di-set:

```env
# ═══ WAJIB ═══

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=gwehai
DB_PASSWORD=<ganti-dengan-password-kuat>
DB_DATABASE=gwehai_db

# Auth — generate random string: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<random-64-char-hex>

# LLM API Key (minimal 1)
DEEPSEEK_API_KEY=sk-...        # ← recommended (cheapest)
# ATAU
OPENAI_API_KEY=sk-...          # GPT-4o
# ATAU
ANTHROPIC_API_KEY=sk-ant-...   # Claude
# ATAU
GEMINI_API_KEY=AIza...         # dari https://aistudio.google.com/app/apikey

# Frontend URL (untuk CORS & OAuth callback)
FRONTEND_URL=http://localhost:5173
```

**Opsional (production / fitur tambahan):**

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# Mail / SMTP
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.example.com
SMTP_PASS=...
SMTP_FROM=noreply@example.com

# Pentest container (auto-detected, jarang perlu diubah)
PENTEST_TOOLS_CONTAINER_NAME=gwehai-pentest-tools
```

### Step 3 — Start Database

```bash
docker compose up -d postgres
```

Verifikasi Postgres jalan:

```bash
docker compose ps
# postgres harus "Up" dan "healthy"

# Test koneksi
docker exec gwehai-postgres pg_isready -U gwehai -d gwehai_db
```

### Step 4 — Run Database Migrations

```bash
cd backend
npm install
npm run migration:run
cd ..
```

### Step 5 — Install Dependencies & Build

```bash
# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### Step 6 — Start Application

**Option A — One script (recommended untuk dev):**

```bash
./local.sh
```

**Option B — Manual (2 terminals):**

```bash
# Terminal 1 — Backend
cd backend && npm run start:dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

**Option C — With database auto-start:**

```bash
./local.sh --db
```

### Step 7 — Start Pentest Tools Container (Opsional)

> Diperlukan kalau mau pakai fitur pentest (nmap, nuclei, sqlmap, dll via container).

```bash
docker compose up -d pentest-tools
```

Verify tools tersedia di container:

```bash
docker exec gwehai-pentest-tools nmap --version
docker exec gwehai-pentest-tools nuclei -version
docker exec gwehai-pentest-tools sqlmap --version
```

### Step 8 — Verify Installation

```bash
# Backend health check
curl http://localhost:3001/health

# Frontend accessible
curl -s http://localhost:5173 | head -5

# Database connected
cd backend && npm run test:db
```

**Expected output:**
- ✅ Backend responds on :3001
- ✅ Frontend serves on :5173
- ✅ Database connection successful
- ✅ (Optional) Pentest tools container running

---

## 4. Scripts Reference

### 📜 Script Tabel

| Script | Lokasi | Fungsi | Kapan Dipake |
|--------|--------|--------|--------------|
| `local.sh` | `./local.sh` | Run backend + frontend sekaligus | Development harian |
| `install-tools.sh` | `./install-tools.sh` | Install pentest CLI tools (nmap, sqlmap, dll) di host | Kalau mau run tools langsung di host (bukan container) |
| `update-exploit-feeds.sh` | `./scripts/update-exploit-feeds.sh` | Update nuclei templates, exploit-db, CVE feed, GitHub advisories | Cron harian / sebelum pentest besar |

### 📜 Detail Scripts

#### `local.sh` — Dev Runner

```bash
# Jalankan backend + frontend
./local.sh

# Jalankan + auto-start PostgreSQL
./local.sh --db
```

**Apa yang dilakukan:**
1. (Optional) Start PostgreSQL via docker compose
2. Start backend (`npm run start:dev`) di background
3. Tunggu 5 detik sampai backend ready
4. Start frontend (`npm run dev`) di foreground
5. Ctrl+C → cleanup otomatis (stop backend)

#### `install-tools.sh` — Pentest Tools Installer

```bash
# Install semua tools
./install-tools.sh

# Dry run (lihat command tanpa execute)
./install-tools.sh --dry-run

# Skip Python/pip tools
./install-tools.sh --skip-pip
```

**Tools yang diinstall:**

| Category | Tools |
|----------|-------|
| **Scanning** | nmap, masscan |
| **DNS/Network** | dig, whois, curl, netcat, traceroute |
| **Web Vuln** | nikto |
| **Python** | sqlmap, wfuzz, sslyze, dirsearch (via pip) |

**OS Support:** Debian/Ubuntu (apt), Fedora/RHEL (dnf), macOS (Homebrew)

> 💡 **Tip:** Kalau pakai Docker container (`docker compose up -d pentest-tools`), tools udah ada di container — ga perlu install di host.

#### `update-exploit-feeds.sh` — Exploit Feed Updater

```bash
# Manual run (di dalam container)
docker exec gwehai-pentest-tools bash /opt/scripts/update-exploit-feeds.sh

# Via cron (recommended — setiap 6 jam)
# Tambahkan ke crontab:
0 */6 * * * docker exec gwehai-pentest-tools bash /opt/scripts/update-exploit-feeds.sh >> /var/log/gwehai/exploit-update.log 2>&1
```

**Sources yang di-update:**

| Source | Method | Apa yang diupdate |
|--------|--------|-------------------|
| **Nuclei Templates** | `nuclei -ut` + git fallback | YAML template scanner |
| **Exploit-DB** | `git pull` | files_exploits.csv + searchsploit |
| **CVE Feed** | curl ke cve.circl.lu | CVE terbaru dari NVD |
| **GitHub Advisories** | GitHub API | GHSA reviewed advisories |

**Output:** Log perubahan (+N NEW items) di stdout + summary di akhir.

---

## 5. Production Deployment

### Pre-Deploy Checklist

> ✅ WAJIB dicek sebelum deploy ke production.

- [ ] **Environment**
  - [ ] `NODE_ENV=production` di backend `.env`
  - [ ] `JWT_SECRET` — random 64-char hex, BUKAN default
  - [ ] `FRONTEND_URL` — set ke domain production (e.g. `https://app.gwehai.com`)
  - [ ] `.env` file TIDAK di-commit ke git (cek `.gitignore`)
  - [ ] Minimal 1 LLM API key terisi dan valid

- [ ] **Database**
  - [ ] PostgreSQL 15+ running (managed service / dedicated server)
  - [ ] Password kuat (bukan `gwehai_dev_password`)
  - [ ] Database accessible dari backend server
  - [ ] Migrations sudah di-run: `npm run migration:run`

- [ ] **Security**
  - [ ] CORS: backend hanya allow frontend origin production
  - [ ] Rate limiting aktif (recommended: `@nestjs/throttler`)
  - [ ] Security headers (recommended: Helmet middleware)
  - [ ] HTTPS di semua endpoint
  - [ ] Google OAuth callback URL di-update di Google Cloud Console

- [ ] **Pentest Tools** (jika dipakai)
  - [ ] Container built dan running
  - [ ] Exploit feeds ter-update: `update-exploit-feeds.sh`
  - [ ] Nuclei templates latest
  - [ ] Volume mounts untuk persistent data

### Deploy Steps

```bash
# 1. Clone / pull latest code
git pull origin main

# 2. Setup environment
cp backend/env.sample backend/.env
# Edit backend/.env sesuai pre-deploy checklist

# 3. Build backend
cd backend
npm ci
npm run build

# 4. Build frontend
cd ../frontend
npm ci
npm run build

# 5. Run migrations
cd ../backend
npm run migration:run

# 6. Start backend (production mode)
NODE_ENV=production node dist/main.js

# 7. Serve frontend (via nginx / reverse proxy)
# Point nginx root ke: frontend/dist/
# Proxy /api → http://localhost:3001
```

### Docker Production Deploy

```bash
# Build images
docker compose -f docker-compose.yml build

# Start all services
docker compose -f docker-compose.yml up -d

# Run migrations inside backend container
docker exec gwehai-backend npm run migration:run

# Verify
docker compose ps
docker compose logs -f --tail=50
```

### Post-Deploy Verify

```bash
# 1. Backend health
curl -f https://your-domain.com/api/health

# 2. Frontend loads
curl -f https://your-domain.com/

# 3. Auth works (register → login → get token)
curl -X POST https://your-domain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test"}'

# 4. LLM responds (chat endpoint)
# Login via frontend, send a message in chat

# 5. Pentest tools (if applicable)
docker exec gwehai-pentest-tools nmap --version
docker exec gwehai-pentest-tools nuclei -version
```

### Rollback

```bash
# Docker rollback
docker compose down
git checkout <previous-tag>
docker compose build
docker compose up -d
cd backend && npm run migration:revert

# Manual rollback
# 1. Stop application
# 2. git checkout <previous-commit>
# 3. npm ci && npm run build (both backend & frontend)
# 4. npm run migration:revert (if DB changed)
# 5. Restart application
```

---

## 6. Troubleshooting

### 🔴 Container / Docker Issues

#### Container ga mau start

```bash
# Cek status & logs
docker compose ps
docker compose logs <service-name>

# Common: port already in use
lsof -i :5432  # PostgreSQL
lsof -i :3001  # Backend
lsof -i :5173  # Frontend

# Fix: stop conflicting service atau ganti port di .env
```

#### "No space left on device"

```bash
# Cleanup Docker
docker system prune -f
docker volume prune -f  # ⚠️ Hapus semua unused volumes

# Cek disk usage
df -h
docker system df
```

#### Postgres: Exit 1 / corrupted data

```bash
# Nuclear option — reset database (DATA HILANG!)
docker compose down postgres
docker volume rm gwehai_postgres_data
docker compose up -d postgres
cd backend && npm run migration:run
```

### 🔴 Browser / Playwright Issues

#### Browser crash / chromium launch failed

```bash
# Install system deps untuk Chromium
npx playwright install-deps

# Atau reinstall browser
npx playwright install chromium

# Di container: rebuild pentest-tools
docker compose build pentest-tools
docker compose up -d pentest-tools
```

#### Playwright "Target closed" / "Session closed"

```
Biasanya terjadi kalau:
1. Container kehabisan memory → increase Docker memory limit
2. Chromium process zombie → restart container: docker compose restart pentest-tools
3. Storage state corrupt → clear: rm -rf backend/skills/browser/storage/
```

### 🔴 Pentest Tools Issues

#### Tools missing di container

```bash
# Verify tools
docker exec gwehai-pentest-tools which nmap nuclei sqlmap ffuf

# Kalau missing, rebuild container
docker compose build --no-cache pentest-tools
docker compose up -d pentest-tools
```

#### "exec: command not found" dari backend

```bash
# Pastikan container running
docker compose ps pentest-tools

# Pastikan env benar
grep PENTEST_TOOLS_CONTAINER_NAME backend/.env
# Harus: PENTEST_TOOLS_CONTAINER_NAME=gwehai-pentest-tools

# Test manual exec
docker exec gwehai-pentest-tools echo "hello"
```

### 🔴 Application Issues

#### Backend ga reachable

```bash
# Cek process
curl http://localhost:3001/health
lsof -i :3001

# Cek logs
cd backend && npm run start:dev
# Baca error di terminal
```

#### CORS errors

```
Fix: Pastikan FRONTEND_URL di backend/.env sesuai dengan URL yang dipakai browser.
- Dev: FRONTEND_URL=http://localhost:5173
- Prod: FRONTEND_URL=https://app.yourdomain.com
```

#### 401 Unauthorized

```
1. Cek token di Network tab → Authorization header
2. Token expired? Login ulang
3. Admin route? User harus role=admin DAN re-login setelah di-promote
```

#### "model not exist" / LLM error

```
1. Cek API key terisi di backend/.env (minimal 1 provider)
2. Cek model ID di logs: [ProviderRouter] ... model: <id>
3. Re-seed models: cd backend && npm run db:seed-models
4. Cek quota/billing di dashboard provider masing-masing
```

#### Database connection refused

```bash
# Pastikan Postgres running
docker compose ps postgres

# Test koneksi manual
docker exec gwehai-postgres pg_isready -U gwehai -d gwehai_db

# Kalau pakai external DB, cek DB_HOST dan DB_PORT di .env
```

---

## 7. Maintenance

### 📅 Routine Tasks

#### Update Exploit Feeds (Recommended: setiap 6 jam)

```bash
# Manual
docker exec gwehai-pentest-tools bash /opt/scripts/update-exploit-feeds.sh

# Cron (add ke crontab)
0 */6 * * * docker exec gwehai-pentest-tools bash /opt/scripts/update-exploit-feeds.sh >> /var/log/gwehai/exploit-update.log 2>&1
```

#### Update Pentest Tools (Recommended: weekly)

```bash
# Update tools di container
docker exec gwehai-pentest-tools /opt/scripts/update-tools.sh

# Atau rebuild container (clean install)
docker compose build --no-cache pentest-tools
docker compose up -d pentest-tools
```

#### Docker Cleanup (Recommended: weekly)

```bash
# Auto cleanup unused images, containers, networks
0 2 * * 0 docker system prune -f >> /var/log/gwehai/cron-prune.log 2>&1
```

### 💾 Backup Database

```bash
# Backup
docker exec gwehai-postgres pg_dump -U gwehai gwehai_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
cat backup_20260101_120000.sql | docker exec -i gwehai-postgres psql -U gwehai gwehai_db

# Automated daily backup (cron)
0 3 * * * docker exec gwehai-postgres pg_dump -U gwehai gwehai_db | gzip > /backup/gwehai_$(date +\%Y\%m\%d).sql.gz
```

### 📝 Log Rotation

```bash
# Docker logs (built-in rotation)
# Tambahkan di docker-compose.yml per service:
logging:
  driver: json-file
  options:
    max-size: "50m"
    max-file: "3"

# Application logs
# Kalau backend nulis ke file, setup logrotate:
cat > /etc/logrotate.d/gwehai << 'EOF'
/var/log/gwehai/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
}
EOF
```

### 🔄 Update GwehAI

```bash
# 1. Backup database dulu!
docker exec gwehai-postgres pg_dump -U gwehai gwehai_db > backup_before_update.sql

# 2. Pull latest code
git pull origin main

# 3. Install dependencies (kalau ada perubahan)
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 4. Run migrations (kalau ada schema baru)
cd backend && npm run migration:run && cd ..

# 5. Rebuild (production)
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# 6. Rebuild Docker images (kalau Dockerfile berubah)
docker compose build
docker compose up -d

# 7. Restart services
# Dev: restart ./local.sh
# Prod: restart systemd service / PM2 / Docker
```

---

## 📖 Additional Resources

| Document | Description |
|----------|-------------|
| [docs/SETUP.md](docs/SETUP.md) | Environment, database, running details |
| [docs/SUBSCRIPTIONS.md](docs/SUBSCRIPTIONS.md) | Plans, PayPal, billing |
| [docs/FEATURES.md](docs/FEATURES.md) | User & admin features |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues & fixes |
| [backend/README.md](backend/README.md) | Backend architecture & scripts |

---

## 🆘 Still Stuck?

1. Check [Troubleshooting](#6-troubleshooting) section above
2. Read logs: `docker compose logs -f --tail=100`
3. Search existing issues in the repo
4. Ask the team

---

*Last updated: 2026-06-12 | GwehAI v1.0*
