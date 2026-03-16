#!/bin/sh
set -e

# Initialize QMD store and download models (skips if already cached)
npx tsx src/init-models.ts

# Start the agent
exec npx tsx src/index.ts
