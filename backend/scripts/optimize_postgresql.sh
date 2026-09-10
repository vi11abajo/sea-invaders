#!/bin/bash
# Script to optimize PostgreSQL for high load (200+ concurrent players)
# Run with: sudo bash optimize_postgresql.sh

echo "🔧 Optimizing PostgreSQL for high load..."

# Backup current config
PGCONF="/etc/postgresql/*/main/postgresql.conf"
sudo cp $PGCONF "${PGCONF}.backup_$(date +%Y%m%d_%H%M%S)"

# Find PostgreSQL version and config file
PGCONF=$(sudo find /etc/postgresql -name postgresql.conf | head -1)

if [ -z "$PGCONF" ]; then
    echo "❌ PostgreSQL config file not found"
    exit 1
fi

echo "📝 Found config: $PGCONF"

# Apply optimizations
echo "Applying optimizations..."

# Max connections: raise to 200
sudo sed -i "s/^#*max_connections = .*/max_connections = 200/" $PGCONF

# Shared buffers: 25% of RAM (12GB here, so 3GB)
sudo sed -i "s/^#*shared_buffers = .*/shared_buffers = 3GB/" $PGCONF

# Effective cache size: 75% of RAM (9GB)
sudo sed -i "s/^#*effective_cache_size = .*/effective_cache_size = 9GB/" $PGCONF

# Work mem: 16MB (for sorts and hash joins)
sudo sed -i "s/^#*work_mem = .*/work_mem = 16MB/" $PGCONF

# Maintenance work mem: 512MB (for VACUUM, CREATE INDEX)
sudo sed -i "s/^#*maintenance_work_mem = .*/maintenance_work_mem = 512MB/" $PGCONF

# Checkpoint settings (better write performance)
sudo sed -i "s/^#*checkpoint_completion_target = .*/checkpoint_completion_target = 0.9/" $PGCONF
sudo sed -i "s/^#*wal_buffers = .*/wal_buffers = 16MB/" $PGCONF

# Random page cost (for SSD)
sudo sed -i "s/^#*random_page_cost = .*/random_page_cost = 1.1/" $PGCONF

# Effective IO concurrency (for SSD)
sudo sed -i "s/^#*effective_io_concurrency = .*/effective_io_concurrency = 200/" $PGCONF

# Max worker processes
sudo sed -i "s/^#*max_worker_processes = .*/max_worker_processes = 8/" $PGCONF

# Max parallel workers per gather
sudo sed -i "s/^#*max_parallel_workers_per_gather = .*/max_parallel_workers_per_gather = 4/" $PGCONF

# Max parallel workers
sudo sed -i "s/^#*max_parallel_workers = .*/max_parallel_workers = 8/" $PGCONF

# Logging (for monitoring slow queries)
sudo sed -i "s/^#*log_min_duration_statement = .*/log_min_duration_statement = 1000/" $PGCONF
sudo sed -i "s/^#*log_line_prefix = .*/log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '/" $PGCONF

echo "✅ Optimization completed!"
echo ""
echo "📋 Applied settings:"
echo "  - max_connections: 200"
echo "  - shared_buffers: 3GB"
echo "  - effective_cache_size: 9GB"
echo "  - work_mem: 16MB"
echo "  - maintenance_work_mem: 512MB"
echo "  - random_page_cost: 1.1 (SSD optimized)"
echo "  - effective_io_concurrency: 200"
echo ""
echo "⚠️  To apply changes, restart PostgreSQL:"
echo "  sudo systemctl restart postgresql"
echo ""
echo "📊 After restart, verify with:"
echo "  psql -U sea_invaders_user -d sea_invaders -c 'SHOW max_connections;'"
