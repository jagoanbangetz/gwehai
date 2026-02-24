# Docker Postgres – "Not Working" / Exit 1

## Cause: No space left on device

If `gwehai-postgres` shows **Exit 1** and logs show:

```text
could not create directory "/var/lib/postgresql/data/pg_wal": No space left on device
```

then the host or Docker has run out of disk space.

## Fix

### 1. Free disk space

**Docker cleanup (safe, reclaims a lot):**

```bash
# Remove stopped containers, unused networks, dangling images
docker system prune -f

# Also remove unused volumes (only if you don't need existing DB data)
docker volume prune -f

# Optional: remove all unused images (reclaim more)
docker image prune -a -f
```

**Check disk usage:**

```bash
df -h
docker system df
```

Free space on the host (e.g. delete large files, empty trash, uninstall apps) until you have at least a few GB free.

### 2. Restart Postgres

```bash
cd /path/to/gwehai
docker-compose up -d postgres
docker-compose ps -a
```

If the **existing volume** was corrupted by the out-of-space condition, remove it and start with a new DB:

```bash
docker-compose down postgres
docker volume rm gwehai_postgres_data
docker-compose up -d postgres
```

**Note:** Removing `gwehai_postgres_data` deletes all data in that Postgres instance. Re-run migrations and re-seed if needed.

### 3. Confirm it’s running

```bash
docker ps | grep postgres
docker exec gwehai-postgres pg_isready -U gwehai -d gwehai_db
```
