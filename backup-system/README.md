# Universal Backup System

Drop-in backup system for any project. Auto-detects services, backs up everything to encrypted storage.

## Supported Services

| Service | Detection | Backup Method |
|---------|-----------|---------------|
| PostgreSQL | Port 5432 / Docker / process | `pg_dump` piped to Restic |
| MySQL/MariaDB | Port 3306 / Docker / process | `mysqldump` piped to Restic |
| MongoDB | Port 27017 / Docker / process | `mongodump --archive` piped to Restic |
| SQLite | File scan (*.db, *.sqlite) | `sqlite3 .backup` to Restic |
| Redis | Port 6379 / Docker / process | `redis-cli --rdb` / BGSAVE |
| Elasticsearch | Port 9200 / Docker | Snapshot API / index export |
| n8n | Port 5678 / Docker / CLI | `n8n export:workflow` |
| Docker | Docker socket | Volume tar / Compose files |
| Kubernetes | kubectl cluster-info | Resource YAML export / PVC backup |
| Files | Always enabled | Configurable include/exclude paths |
| Git | .git directory | `git bundle` (all branches + tags) |

## Quick Start

```bash
# 1. Install dependencies
./install.sh

# 2. Configure
cp config/backup.yaml.example config/backup.yaml
nano config/backup.yaml  # Set your password and destinations

# 3. Run backup
./backup.sh

# 4. Or use the web dashboard
python3 server.py
# Open http://localhost:8080
```

## Web Dashboard

The built-in dashboard lets you manage multiple backup projects from a browser:

```bash
python3 server.py --port 8080
```

- Create/delete projects (each project = separate config + logs)
- Run backups and see real-time logs
- View snapshots and restore
- Auto-detect services per project
- Dark/light theme

## CLI Usage

```bash
# Full backup (auto-detect services)
./backup.sh

# Preview without making changes
./backup.sh --dry-run --verbose

# Backup specific service only
./backup.sh --service postgresql

# Show detected services
./backup.sh --detect

# Show latest snapshots
./backup.sh --status

# Restore
./restore.sh --list
./restore.sh --snapshot abc123 --target ./restored/
```

## Configuration

Copy `config/backup.yaml.example` to `config/backup.yaml` and edit:

```yaml
backup:
  project_name: "my-project"

  services:
    postgresql:
      enabled: auto      # auto-detect, true, or false
      host: localhost
      port: 5432
    # ... more services

  destinations:
    local:
      enabled: true
      path: "/backup/restic-repo"
    s3:
      enabled: false
      bucket: "my-bucket"

  encryption:
    password: "your-secure-password"  # Or use RESTIC_PASSWORD env var

  retention:
    keep_daily: 30
    keep_weekly: 12
```

## Scheduling

### Systemd (recommended)
```bash
./install.sh --systemd
sudo systemctl enable backup.timer
sudo systemctl start backup.timer
```

### Cron
```bash
# Daily at 2 AM
0 2 * * * /path/to/backup-system/backup.sh
```

## Adding to an Existing Project

```bash
# Copy backup-system/ into your project
cp -r backup-system/ /path/to/your/project/

# Configure
cd /path/to/your/project/backup-system
cp config/backup.yaml.example config/backup.yaml
nano config/backup.yaml

# Run
./backup.sh --detect  # See what's detected
./backup.sh           # Run backup
```

## Architecture

```
backup-system/
├── backup.sh           # Main orchestrator
├── restore.sh          # Restore from backup
├── install.sh          # Install dependencies
├── server.py           # Web dashboard API server
├── config/             # YAML configuration
├── handlers/           # One file per service (Strategy Pattern)
├── lib/                # Shared utilities
├── frontend/           # HTML/CSS/JS dashboard
├── projects/           # Per-project configs (auto-created)
├── systemd/            # Systemd service/timer units
└── tests/              # Test suite
```

**Design Patterns**: Strategy (handlers), Observer (notifications), Factory (handler auto-discovery), Facade (API client), Template Method (handler lifecycle).

## Tests

```bash
# Unit tests (no server needed)
bash tests/test_handlers.sh
bash tests/test_detection.sh
bash tests/test_edge_cases.sh

# API tests (start server first)
python3 server.py &
bash tests/test_api.sh
bash tests/test_frontend.sh
```

## Dependencies

Installed automatically by `install.sh`:

- **restic** - Encrypted, deduplicated backup storage
- **rclone** - Cloud storage transport (70+ providers)
- **yq** - YAML parser (mikefarah/yq)
- **jq** - JSON parser
- **netcat** - Port detection
- **python3** - Dashboard server (stdlib only)
