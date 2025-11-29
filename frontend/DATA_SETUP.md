# Data Setup for Traffic Flow Dashboard

## Quick Setup

The dashboard needs access to data files from the parent directory. Run this once:

```bash
./setup-data.sh
```

This copies the necessary data files to the `public` folder where Vite can serve them.

## Data Files Used

### DLR Footfall Data
- **Source:** `../automated_collection/open-data/dlr_footfall/date=2025-11-07/1762547729454.csv`
- **Copied to:** `public/automated_collection/open-data/dlr_footfall/date=2025-11-07/`
- **Contains:** Hourly pedestrian counts from multiple DLR locations

### SCATS Locations
- **Source:** `../automated_collection/open-data/dlr_scats_locations/date=2025-11-07/1762545401457.csv`
- **Copied to:** `public/automated_collection/open-data/dlr_scats_locations/date=2025-11-07/`
- **Contains:** 290 traffic monitoring site locations with GPS coordinates

### Session Data (Costa & TBC)
- **Source:** `../automated_collection/sessions/`
- **Copied to:** `public/automated_collection/sessions/`
- **Contains:** 
  - Costa Coffee sensor data (3 sessions)
  - Two Boys Cafe sensor data (if available)
  - Audio, light, accelerometer, GPS, magnetometer readings

## Manual Data (Optional)

The dashboard can also use detailed CSV files from:
- `../manual_collection/costa_data/` - Detailed Costa sensor logs
- `../manual_collection/tbc_data/` - Detailed TBC sensor logs

These are optional and the dashboard works with just the session JSON files.

## Running the Dashboard

After running `./setup-data.sh`:

```bash
npm run dev
```

The dashboard will be available at `http://localhost:8080`

## Features

- **Business Selection:** Toggle between Costa Coffee, Two Boys Cafe, or Combined view
- **Real Data:** Loads actual footfall and sensor data
- **Dynamic Charts:** Updates based on selected business
- **Activity Rate:** Calculated from actual audio sensor readings

## Troubleshooting

If data doesn't load:
1. Make sure you ran `./setup-data.sh`
2. Check browser console for errors
3. Verify files exist in `public/automated_collection/`
4. The dashboard will use fallback data if files can't be loaded

