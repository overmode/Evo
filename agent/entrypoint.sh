#!/bin/sh
set -e

# Full initialization: workspace + QMD store + model downloads
npx tsx src/init.ts

# Start the agent
exec npx tsx src/index.ts
