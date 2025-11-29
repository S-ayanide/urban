#!/bin/bash
# Setup script to copy data files to public folder for Vite to serve

echo "Setting up data files for the dashboard..."

# Create public data directories
mkdir -p public/automated_collection/open-data/dlr_footfall/date=2025-11-07
mkdir -p public/automated_collection/open-data/dlr_scats_locations/date=2025-11-07
mkdir -p public/automated_collection/sessions/date=2025-11-06/device=android-7ef705ff
mkdir -p public/automated_collection/sessions/date=2025-11-07/device=android-50dd91de
mkdir -p public/automated_collection/sessions/date=2025-11-07/device=android-83e6dd1a
mkdir -p public/manual_collection/costa_data
mkdir -p public/manual_collection/tbc_data

# Copy data files
if [ -f "../automated_collection/open-data/dlr_footfall/date=2025-11-07/1762547729454.csv" ]; then
  cp "../automated_collection/open-data/dlr_footfall/date=2025-11-07/1762547729454.csv" \
     "public/automated_collection/open-data/dlr_footfall/date=2025-11-07/"
  echo "✓ Copied footfall data"
else
  echo "⚠ Footfall data not found"
fi

if [ -f "../automated_collection/open-data/dlr_scats_locations/date=2025-11-07/1762545401457.csv" ]; then
  cp "../automated_collection/open-data/dlr_scats_locations/date=2025-11-07/1762545401457.csv" \
     "public/automated_collection/open-data/dlr_scats_locations/date=2025-11-07/"
  echo "✓ Copied SCATS locations"
else
  echo "⚠ SCATS locations not found"
fi

# Create symlink for SCATS traffic data (too large to copy)
if [ -f "../SCATSMay2025.csv" ]; then
  ln -sf "../../SCATSMay2025.csv" "public/SCATSMay2025.csv" 2>/dev/null || \
  cp "../SCATSMay2025.csv" "public/SCATSMay2025.csv"
  echo "✓ Linked SCATS traffic data (large file)"
else
  echo "⚠ SCATS traffic data not found at ../SCATSMay2025.csv"
fi

# Copy session files
if [ -f "../automated_collection/sessions/date=2025-11-06/device=android-7ef705ff/1762460820283.json" ]; then
  cp "../automated_collection/sessions/date=2025-11-06/device=android-7ef705ff/1762460820283.json" \
     "public/automated_collection/sessions/date=2025-11-06/device=android-7ef705ff/"
  echo "✓ Copied session 1"
fi

if [ -f "../automated_collection/sessions/date=2025-11-07/device=android-50dd91de/1762520691350.json" ]; then
  cp "../automated_collection/sessions/date=2025-11-07/device=android-50dd91de/1762520691350.json" \
     "public/automated_collection/sessions/date=2025-11-07/device=android-50dd91de/"
  echo "✓ Copied session 2"
fi

if [ -f "../automated_collection/sessions/date=2025-11-07/device=android-83e6dd1a/1762519995678.json" ]; then
  cp "../automated_collection/sessions/date=2025-11-07/device=android-83e6dd1a/1762519995678.json" \
     "public/automated_collection/sessions/date=2025-11-07/device=android-83e6dd1a/"
  echo "✓ Copied session 3"
fi

# Copy manual collection data (Costa)
if [ -d "../manual_collection/costa_data" ]; then
  cp -r "../manual_collection/costa_data/"* "public/manual_collection/costa_data/" 2>/dev/null || true
  echo "✓ Copied Costa manual data"
fi

# Copy manual collection data (TBC)
if [ -d "../manual_collection/tbc_data" ]; then
  cp -r "../manual_collection/tbc_data/"* "public/manual_collection/tbc_data/" 2>/dev/null || true
  echo "✓ Copied TBC manual data"
fi

echo ""
echo "✅ Data setup complete! You can now run 'npm run dev'"
echo "   The dashboard will load data from the public folder"
echo "   Note: SCATS traffic data is large - analysis may take time"

