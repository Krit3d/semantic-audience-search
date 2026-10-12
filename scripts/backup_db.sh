#!/bin/bash

# Exit on error, undefined variable, and pipe failure for production robustness
set -euo pipefail

# Get the directory where this script is located to resolve relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Project root is parent directory of scripts/
PROJECT_ROOT="$SCRIPT_DIR/.."
# Path to .env configuration file
ENV_FILE="$PROJECT_ROOT/.env"
# Directory to store backup files
BACKUPS_DIR="$PROJECT_ROOT/backups"

# Load environment variables from .env file
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    exit 1
fi

# Export all variables from .env to make them available to subprocesses
set -a
source "$ENV_FILE"
set +a

# Validate required PostgreSQL environment variables are set
REQUIRED_VARS=("POSTGRES_USER" "POSTGRES_DB" "POSTGRES_PASSWORD")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "ERROR: Required environment variable $var is not set in .env"
        exit 1
    fi
done

# Create backups directory if it does not exist
mkdir -p "$BACKUPS_DIR"

# Generate timestamp in yyyy-mm-dd_HHMMSS format for unique backup filename
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILENAME="backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="$BACKUPS_DIR/$BACKUP_FILENAME"

echo "Starting PostgreSQL backup at $(date)"
echo "Target backup file: $BACKUP_PATH"

# Rotation policy:
#   - keep the 4 newest backups (fresh daily recovery points);
#   - additionally keep one weekly archive: backups created on Sunday are
#     retained for BACKUP_KEEP_WEEKLY_DAYS (default 30) days;
#   - everything else older than 7 days is deleted.
# Runs ALWAYS (even when pg_dump fails) to prevent disk-fill deadlock.
rotate_backups() {
    echo "Cleaning up backups: keep 4 newest + Sunday archives for ${BACKUP_KEEP_WEEKLY_DAYS:-30} days..."
    local keep_weekly_days="${BACKUP_KEEP_WEEKLY_DAYS:-30}"
    local now f base fdate age_days dow

    now=$(date +%s)
    for f in "$BACKUPS_DIR"/backup_*.sql.gz; do
        [ -e "$f" ] || continue
        age_days=$(( (now - $(stat -c %Y "$f")) / 86400 ))
        [ "$age_days" -le 7 ] && continue

        base=$(basename "$f")
        fdate="${base#backup_}"; fdate="${fdate%%_*}"   # yyyy-mm-dd from filename
        dow=$(date -d "$fdate" +%u 2>/dev/null || echo 0)
        if [ "$dow" = "7" ] && [ "$age_days" -le "$keep_weekly_days" ]; then
            echo "Keeping weekly archive: $f"
            continue
        fi
        rm -f "$f"
    done

    # Hard cap: keep at most 4 newest among non-archive files
    ls -t "$BACKUPS_DIR"/backup_*.sql.gz 2>/dev/null | while read -r f; do
        base=$(basename "$f")
        fdate="${base#backup_}"; fdate="${fdate%%_*}"
        dow=$(date -d "$fdate" +%u 2>/dev/null || echo 0)
        [ "$dow" = "7" ] && continue
        echo "$f"
    done | tail -n +5 | xargs -r rm -f
}

# Pre-dump disk guard: ensure at least MIN_FREE_MB free, deleting oldest backups if needed
MIN_FREE_MB="${BACKUP_MIN_FREE_MB:-10240}"
while true; do
    avail_mb=$(df -Pm "$BACKUPS_DIR" | awk 'NR==2 {print $4}')
    if [ "$avail_mb" -ge "$MIN_FREE_MB" ]; then
        break
    fi
    oldest=$(ls -t "$BACKUPS_DIR"/backup_*.sql.gz 2>/dev/null | while read -r f; do
        base=$(basename "$f")
        fdate="${base#backup_}"; fdate="${fdate%%_*}"
        [ "$(date -d "$fdate" +%u 2>/dev/null || echo 0)" = "7" ] && continue
        echo "$f"
    done | tail -n 1)
    # Last resort: if only Sunday archives remain, sacrifice the oldest one
    if [ -z "$oldest" ]; then
        oldest=$(ls -t "$BACKUPS_DIR"/backup_*.sql.gz 2>/dev/null | tail -n 1)
    fi
    if [ -z "$oldest" ]; then
        echo "ERROR: only ${avail_mb} MB free and no backups left to remove. Aborting."
        exit 1
    fi
    echo "Low disk space (${avail_mb} MB free). Removing oldest backup: $oldest"
    rm -f "$oldest"
done

# Execute pg_dump inside the 'tg_parser_db' Docker container, pipe output to gzip for compression
# PGPASSWORD is passed as environment variable to the container for authentication
dump_rc=0
if docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" tg_parser_db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_PATH"; then
    echo "Backup completed successfully: $BACKUP_PATH"
else
    echo "ERROR: Backup failed during pg_dump or compression"
    # Remove partial/invalid backup file if creation failed
    rm -f "$BACKUP_PATH"
    dump_rc=1
fi

# Rotation must run even when the dump failed (disk full is exactly when rotation is needed)
rotate_backups

if [ "$dump_rc" -ne 0 ]; then
    exit 1
fi

echo "Backup process finished successfully at $(date)"
