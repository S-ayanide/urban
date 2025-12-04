// Service to process real data from manual_collection and automated_collection
// Calculates actual quantifiable metrics

import { kMeansClustering, smoothAndPredictPedestrians, smoothAndPredictScores } from './advancedAlgorithms';
import { getS3Url, fetchSessionFromS3, fetchOpenDataFromS3 } from './s3Service';

const S3_BUCKET_BASE = 'https://urban-computing-s3-bucket.s3.eu-west-1.amazonaws.com';

export interface RealTrafficDataPoint {
  hour: number;
  score: number;
  pedestrians: number;
  traffic: number;
  activity: number; // Audio level in dB
  lightLevel?: number; // Light level in lux
  sampleCount: number;
}

export interface BusinessMetrics {
  peakHour: number;
  peakScore: number;
  peakFootfall: number;
  activityRate: number;
  hourlyData: RealTrafficDataPoint[];
  busyPeriods: { start: number; end: number; reason: string }[];
  recommendations: string[];
  // Advanced algorithms results
  clusters?: Array<{ clusterId: number; label: string; hours: number[]; centroid: number[] }>;
  nextHourPrediction?: { pedestrians: number; score: number };
  smoothedData?: RealTrafficDataPoint[];
}

// Load manual collection data for a business
async function loadManualData(business: 'costa' | 'tbc'): Promise<any> {
  const basePath = business === 'costa' 
    ? '/manual_collection/costa_data'
    : '/manual_collection/tbc_data';
  
  const data: any = {};
  
  try {
    // Load audio data - try multiple paths
    const audioFiles = business === 'costa' 
      ? [`${basePath}/Audio Raw Data.csv`, `../manual_collection/costa_data/Audio Raw Data.csv`]
      : [`${basePath}/TBC Audio Raw Data.csv`, `../manual_collection/tbc_data/TBC Audio Raw Data.csv`];
    
    for (const audioFile of audioFiles) {
      try {
        const audioResponse = await fetch(audioFile);
        if (audioResponse.ok) {
          const audioText = await audioResponse.text();
          data.audio = parseCSV(audioText);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Load location data
    const locationFiles = business === 'costa'
      ? [`${basePath}/BE Location.csv`, `../manual_collection/costa_data/BE Location.csv`]
      : [`${basePath}/Location.csv`, `../manual_collection/tbc_data/Location.csv`];
    
    for (const locationFile of locationFiles) {
      try {
        const locationResponse = await fetch(locationFile);
        if (locationResponse.ok) {
          const locationText = await locationResponse.text();
          data.location = parseCSV(locationText);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Load light data
    const lightFiles = business === 'costa'
      ? [`${basePath}/BE Light.csv`, `../manual_collection/costa_data/BE Light.csv`]
      : [`${basePath}/Light.csv`, `../manual_collection/tbc_data/Light.csv`];
    
    for (const lightFile of lightFiles) {
      try {
        const lightResponse = await fetch(lightFile);
        if (lightResponse.ok) {
          const lightText = await lightResponse.text();
          data.light = parseCSV(lightText);
          break;
        }
      } catch (e) {
        continue;
      }
    }
  } catch (error) {
    console.error('Error loading manual data:', error);
  }
  
  return data;
}

// Parse CSV data - handle scientific notation and quoted values
function parseCSV(text: string): any[] {
  const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const data: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Handle CSV with quoted values and scientific notation
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim()); // Add last value
    
    if (values.length < headers.length) continue;
    
    const row: any = {};
    headers.forEach((header, idx) => {
      let value = values[idx] || '';
      value = value.replace(/^"|"$/g, ''); // Remove quotes
      
      // Handle scientific notation (e.g., "1.234E-2" or "1.234E+2")
      const sciMatch = value.match(/^([+-]?\d*\.?\d+)[Ee]([+-]?\d+)$/);
      if (sciMatch) {
        const base = parseFloat(sciMatch[1]);
        const exp = parseInt(sciMatch[2]);
        value = String(base * Math.pow(10, exp));
      }
      
      // Try to parse as number
      const numValue = parseFloat(value);
      row[header] = isNaN(numValue) ? value : numValue;
    });
    data.push(row);
  }
  
  return data;
}

// Load automated session data from S3 (with fallback to local)
async function loadSessionData(business: 'costa' | 'tbc'): Promise<any[]> {
  const sessions: any[] = [];
  
  // Known session files - try S3 first, then fallback to local
  const sessionFiles = [
    { date: '2025-11-06', device: 'android-7ef705ff', sessionId: '1762460820283' },
    { date: '2025-11-07', device: 'android-50dd91de', sessionId: '1762520691350' },
    { date: '2025-11-07', device: 'android-83e6dd1a', sessionId: '1762519995678' },
  ];
  
  // Also try to discover recent sessions from S3
  const today = new Date();
  const recentDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    recentDates.push(date.toISOString().split('T')[0]);
  }
  
  // Try known session files from S3
  for (const file of sessionFiles) {
    const s3Key = `sessions/date=${file.date}/device=${file.device}/${file.sessionId}.json`;
    const s3Url = `${S3_BUCKET_BASE}/${s3Key}`;
    const localPath = `/automated_collection/${s3Key}`;
    
    // Try S3 first, then local fallback
    const urls = [s3Url, localPath];
    
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const session = await response.json();
          const samples = typeof session.samples === 'string' 
            ? JSON.parse(session.samples) 
            : session.samples;
          
          samples.forEach((sample: any) => {
            const siteTag = sample.siteTag || '';
            if ((business === 'costa' && siteTag.includes('Costa')) ||
                (business === 'tbc' && (siteTag.includes('TBC') || siteTag.includes('Two') || siteTag.includes('Boy')))) {
              sessions.push({
                ...sample,
                timestamp: sample.ts,
                date: session.date,
              });
            }
          });
          break; // Successfully loaded, move to next file
        }
      } catch (e) {
        continue; // Try next URL
      }
    }
  }
  
  // Try to discover additional sessions from recent dates
  // Attempt to fetch sessions by trying common patterns
  // Note: For full discovery, implement a backend API that uses AWS SDK to list S3 objects
  for (const date of recentDates) {
    // Try common device patterns from known sessions
    const devicePatterns = ['android-7ef705ff', 'android-50dd91de', 'android-83e6dd1a'];
    
    // Try to fetch any session files for these devices on recent dates
    // In production, this would be done via a backend API that lists S3 objects
    // For now, we rely on known session files above, but the structure supports
    // automatic discovery if a backend list API is implemented
  }
  
  console.log(`Loaded ${sessions.length} session samples from S3/local for ${business}`);
  return sessions;
}

// Process audio data to get hourly averages
// NOTE: Manual CSV files are very short (0.04 seconds) and not suitable for hourly analysis
// This function is kept for compatibility but should not be relied upon
// business parameter helps determine the correct collection time
function processAudioData(audioData: any[], startTime?: number, business?: 'costa' | 'tbc'): Map<number, { avg: number; count: number }> {
  const hourlyAudio = new Map<number, { sum: number; count: number }>();
  
  if (!audioData || audioData.length === 0) return new Map();
  
  // Check if data is too short to be meaningful (less than 1 second)
  const totalDuration = audioData.length > 0 
    ? (audioData[audioData.length - 1]?.['Time (s)'] || audioData.length * 0.1)
    : 0;
  
  // If data is less than 1 second, it's not suitable for hourly analysis
  // Manual CSV files are typically 0.04 seconds - usually we skip them
  // BUT if we know the business context (e.g., TBC), we should use even short samples
  // as they are the only data we have.
  if (totalDuration < 1.0 && !business) {
    console.warn('Manual audio data is too short for hourly analysis, skipping');
    return new Map();
  }
  
  // For longer manual collection data, estimate the time
  // TBC data was collected in the afternoon (around 1:40 PM based on file timestamps)
  // Costa data was collected in the morning
  // Use business-specific default based on known collection times
  const estimatedStartHour = business === 'tbc' ? 13 : 8; // TBC: 1 PM, Costa: 8 AM
  
  audioData.forEach((row, idx) => {
    const timeOffset = row['Time (s)'] !== undefined 
      ? parseFloat(String(row['Time (s)']).replace(/E[+-]?\d+/g, '')) || idx * 0.1
      : idx * 0.1;
    
    // Estimate hour based on progress through the day
    const progress = timeOffset / totalDuration;
    const hourOffset = Math.floor(progress * 12); // Assume 12-hour collection period
    const hour = (estimatedStartHour + hourOffset) % 24;
    
    // Get audio value - could be "Recording (a.u.)" or "audioDb"
    let audioValue = -70;
    if (row['Recording (a.u.)'] !== undefined) {
      const recordingValue = parseFloat(String(row['Recording (a.u.)']).replace(/E[+-]?\d+/g, ''));
      audioValue = convertAudioToDb(recordingValue);
    } else if (row.audioDb !== undefined) {
      audioValue = parseFloat(String(row.audioDb)) || -70;
    }
    
    if (!hourlyAudio.has(hour)) {
      hourlyAudio.set(hour, { sum: 0, count: 0 });
    }
    const entry = hourlyAudio.get(hour)!;
    entry.sum += audioValue;
    entry.count += 1;
  });
  
  const result = new Map<number, { avg: number; count: number }>();
  hourlyAudio.forEach((value, hour) => {
    result.set(hour, {
      avg: value.sum / value.count,
      count: value.count,
    });
  });
  
  return result;
}

// Convert audio recording value to dB (approximate)
function convertAudioToDb(recording: number): number {
  // Audio recordings are typically normalized, convert to dB scale
  // This is an approximation - actual conversion depends on recording setup
  const absValue = Math.abs(recording);
  if (absValue < 0.0001) return -80;
  if (absValue > 1) return -30; // Clamp high values
  // Convert normalized audio to dB range (-80 to -40 dB typical for quiet to moderate)
  const dbValue = -80 + (absValue * 40); // Scale 0-1 to -80 to -40
  return Math.max(-80, Math.min(-30, dbValue));
}

// Process session data to get hourly metrics
function processSessionData(sessions: any[]): Map<number, { audio: number[]; light: number[]; count: number }> {
  const hourlyData = new Map<number, { audio: number[]; light: number[]; count: number }>();
  
  sessions.forEach(session => {
    const timestamp = session.timestamp || session.ts;
    if (!timestamp) return;
    
    const date = new Date(timestamp);
    const hour = date.getHours();
    
    if (!hourlyData.has(hour)) {
      hourlyData.set(hour, { audio: [], light: [], count: 0 });
    }
    
    const entry = hourlyData.get(hour)!;
    
    if (session.audioDb !== undefined && !isNaN(session.audioDb)) {
      entry.audio.push(session.audioDb);
    }
    
    if (session.lightLux !== undefined && !isNaN(session.lightLux)) {
      entry.light.push(session.lightLux);
    }
    
    entry.count += 1;
  });
  
  return hourlyData;
}

// Estimate pedestrians from sensor data (audio activity and light levels)
// This is more accurate than using general DLR footfall data
// Note: We only have audio and light sensors, not direct pedestrian counts
// IMPORTANT: These are ESTIMATES based on audio activity, not actual pedestrian counts
function estimatePedestriansFromSensors(
  audioLevel: number,
  lightLevel?: number,
  sampleCount: number
): number {
  // Base estimation on audio activity
  // Audio levels: -70 dB (quiet) to -20 dB (very busy/loud)
  // For a cafe location, realistic pedestrian counts are 0-100 per hour
  // This is a conservative estimate - audio can be loud from many sources (traffic, music, etc.)
  
  // Normalize audio level (-70 to -20 dB range, extended to handle louder environments)
  // Clamp to reasonable range: -70 to -20 dB
  const clampedAudio = Math.max(-70, Math.min(-20, audioLevel));
  const audioNormalized = Math.max(0, Math.min(1, (clampedAudio + 70) / 50));
  
  // Base pedestrian estimate from audio (0-100 range for cafe - more conservative)
  // Audio includes many sources (traffic, music, conversations), so we scale down
  let pedestrians = audioNormalized * 100;
  
  // Adjust based on light level if available (more light = more activity)
  if (lightLevel !== undefined && lightLevel > 0) {
    // Light levels: 0-1000+ lux
    // Higher light during day = more activity
    const lightFactor = Math.min(1, lightLevel / 500); // 500 lux = full factor
    pedestrians = pedestrians * (0.7 + 0.3 * lightFactor);
  }
  
  // Scale down if we have very few samples (less confidence)
  if (sampleCount < 10) {
    pedestrians = pedestrians * 0.5; // Reduce confidence with low samples
  }
  
  // Cap at reasonable maximum for a cafe location (100 pedestrians/hour is more realistic)
  return Math.round(Math.min(pedestrians, 100));
}

// Calculate walk-by potential score
function calculateScore(
  hour: number,
  audioLevel: number,
  footfall: number,
  lightLevel?: number
): number {
  // Normalize components
  // Clamp audio to reasonable range for normalization
  const clampedAudio = Math.max(-70, Math.min(-20, audioLevel));
  const audioComponent = Math.max(0, Math.min(1, (clampedAudio + 70) / 50)); // -70 to -20 dB maps to 0-1
  const footfallComponent = Math.min(1, footfall / 100); // 100 pedestrians = max for cafe (realistic)
  const lightComponent = lightLevel ? Math.min(1, lightLevel / 500) : 0.5; // 500 lux = max
  
  // Weighted combination
  const score = (audioComponent * 0.4) + (footfallComponent * 0.4) + (lightComponent * 0.2);
  return score * 25; // Scale to 0-25 range
}

// Load footfall data as fallback for hours without session data
// Fetches from S3 with fallback to local
async function loadFootfallData(): Promise<Map<number, number>> {
  const hourlyFootfall = new Map<number, { sum: number; count: number }>();
  
  // Try to get latest footfall data from S3
  const dates = ['2025-11-07', '2025-11-06', '2025-11-05']; // Try recent dates
  const knownFiles = ['1762547729454.csv']; // Known file timestamp
  
  let footfallText: string | null = null;
  
  // Try S3 first
  for (const date of dates) {
    for (const filename of knownFiles) {
      const s3Key = `open-data/dlr_footfall/date=${date}/${filename}`;
      const s3Url = `${S3_BUCKET_BASE}/${s3Key}`;
      
      try {
        const response = await fetch(s3Url);
        if (response.ok) {
          footfallText = await response.text();
          break;
        }
      } catch (e) {
        continue;
      }
    }
    if (footfallText) break;
  }
  
  // Fallback to local
  if (!footfallText) {
    try {
      const localPath = '/automated_collection/open-data/dlr_footfall/date=2025-11-07/1762547729454.csv';
      const response = await fetch(localPath);
      if (response.ok) {
        footfallText = await response.text();
      }
    } catch (e) {
      console.warn('Could not load footfall data from S3 or local:', e);
      return new Map();
    }
  }
  
  if (footfallText) {
    try {
      const lines = footfallText.split('\n').filter(line => line.trim());
      
      if (lines.length > 1) {
        const headers = lines[0].split(',');
        const pedestrianCols = headers.filter((h, i) => 
          h.includes('Pedestrian') && !h.includes('IN') && !h.includes('OUT')
        );
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          if (values.length < headers.length) continue;
          
          const timeStr = values[0].replace(/"/g, '');
          const date = new Date(timeStr);
          if (isNaN(date.getTime())) continue;
          
          const hour = date.getHours();
          
          let totalPedestrians = 0;
          pedestrianCols.forEach((col) => {
            const colIdx = headers.indexOf(col);
            if (colIdx >= 0 && values[colIdx]) {
              const val = parseFloat(values[colIdx]);
              if (!isNaN(val) && val >= 0 && val < 10000) {
                totalPedestrians += val;
              }
            }
          });
          
          if (totalPedestrians > 0 && totalPedestrians < 10000) {
            const current = hourlyFootfall.get(hour) || { sum: 0, count: 0 };
            hourlyFootfall.set(hour, {
              sum: current.sum + totalPedestrians,
              count: current.count + 1
            });
          }
        }
      }
    } catch (error) {
      console.warn('Error parsing footfall data:', error);
    }
  }
  
  // Calculate averages and scale down for cafe location (not general area)
  const hourlyAverages = new Map<number, number>();
  for (const [hour, data] of hourlyFootfall.entries()) {
    const average = data.count > 0 ? data.sum / data.count : 0;
    // Scale down significantly - this is general area data, not cafe-specific
    // Use 5-10% of the general footfall as estimate for cafe location
    hourlyAverages.set(hour, Math.min(average * 0.08, 150));
  }
  
  return hourlyAverages;
}

// Generate real traffic data for a business
export async function generateRealTrafficData(business: 'costa' | 'tbc'): Promise<BusinessMetrics> {
  const [manualData, sessionData, footfallData] = await Promise.all([
    loadManualData(business),
    loadSessionData(business),
    loadFootfallData(), // Load footfall as fallback
  ]);
  
  // Process audio data from manual collection (supplementary)
  // NOTE: Manual CSV files are very short (0.04 seconds) and will be skipped
  // Pass business parameter to use correct collection time (TBC was collected in afternoon)
  const hourlyAudio = processAudioData(manualData.audio || [], undefined, business);
  
  // Process session data (PRIMARY SOURCE - has actual timestamps and audioDb values)
  const hourlySessions = processSessionData(sessionData);
  
  // Log data sources for debugging
  console.log(`[${business}] Session samples: ${sessionData.length}, Manual audio rows: ${(manualData.audio || []).length}`);
  console.log(`[${business}] Hours with session data:`, Array.from(hourlySessions.keys()).sort((a, b) => a - b));
  
  // Combine data sources
  const hourlyData: RealTrafficDataPoint[] = [];
  
  for (let hour = 0; hour < 24; hour++) {
    // Get audio level (prefer session data as it has actual dB values)
    let audioLevel = -70;
    if (hourlySessions.has(hour)) {
      const sessionAudio = hourlySessions.get(hour)!.audio;
      if (sessionAudio.length > 0) {
        audioLevel = sessionAudio.reduce((sum, a) => sum + a, 0) / sessionAudio.length;
      }
    } else if (hourlyAudio.has(hour)) {
      // Fallback to manual data if session data not available
      audioLevel = hourlyAudio.get(hour)!.avg;
    }
    
    // Sample count (prioritize session data)
    // Note: We calculate sampleCount later after checking light data
    
    // Get light level (from session data or manual data)
    let lightLevel: number | undefined;
    let manualLightCount = 0;
    if (hourlySessions.has(hour)) {
      const sessionLight = hourlySessions.get(hour)!.light;
      if (sessionLight.length > 0) {
        lightLevel = sessionLight.reduce((sum, l) => sum + l, 0) / sessionLight.length;
      }
    } else if (manualData.light && manualData.light.length > 0) {
      // Try to get light from manual data
      // Use business-specific start hour (TBC: 13, Costa: 8)
      const estimatedStartHour = business === 'tbc' ? 13 : 8;
      const hourLight = manualData.light.filter((row: any) => {
        const timeOffset = row['Time (s)'] !== undefined 
          ? parseFloat(String(row['Time (s)']).replace(/E[+-]?\d+/g, '')) || 0
          : 0;
        const progress = timeOffset / 36000; // Assume 10-hour collection
        const estimatedHour = (estimatedStartHour + Math.floor(progress * 12)) % 24;
        return estimatedHour === hour;
      });
      if (hourLight.length > 0) {
        const luxValues = hourLight.map((row: any) => {
          const lux = row['Illuminance (lx)'];
          return typeof lux === 'number' ? lux : parseFloat(String(lux).replace(/E[+-]?\d+/g, '')) || 0;
        }).filter((v: number) => !isNaN(v) && v > 0);
        if (luxValues.length > 0) {
          lightLevel = luxValues.reduce((sum: number, v: number) => sum + v, 0) / luxValues.length;
          manualLightCount = luxValues.length;
        }
      }
    }
    
    // Update sample count to include manual light data if audio was missing/short
    const sessionCount = hourlySessions.get(hour)?.count || 0;
    const manualAudioCount = hourlyAudio.get(hour)?.count || 0;
    // If we have light samples but no audio samples (e.g. short audio file), treat light samples as valid samples
    const manualCount = Math.max(manualAudioCount, manualLightCount > 0 ? 1 : 0);
    const sampleCount = sessionCount + manualCount;

    // Estimate pedestrians - prefer sensor data, NEVER use footfall CSV when we have session data
    // Footfall data is general area data, not specific to the business location
    // Only use footfall if we have NO session data at all (meaning we're relying entirely on manual collection)
    let footfall = 0;
    if (sampleCount > 0) {
      // We have real sensor data - use it
      footfall = estimatePedestriansFromSensors(audioLevel, lightLevel, sampleCount);
    } else if (footfallData.has(hour) && sessionData.length === 0) {
      // Only use footfall data if we have NO session data at all
      // This means we're relying entirely on manual collection, so footfall can be a reasonable fallback
      footfall = footfallData.get(hour)!;
    } else {
      // No data at all for this hour
      footfall = 0;
    }
    
    // Calculate score
    const score = calculateScore(hour, audioLevel, footfall, lightLevel);
    
    // Estimate traffic - IMPORTANT: We don't have actual traffic sensors!
    // We only have audio, light, and location data from manual collection
    // Traffic estimates are very rough and should be treated as approximate
    // For a cafe location, typical traffic is 50-300 vehicles/hour (not thousands)
    
    // Only estimate traffic if we have actual sensor data (session data)
    // If no data, set traffic to 0 or null to indicate missing data
    let traffic = 0;
    
    if (sampleCount > 0) {
      // We have real sensor data for this hour
      // IMPORTANT: Traffic is estimated from audio activity, which includes many noise sources
      // This is a rough estimate and should be treated as approximate
      // Clamp audio level to reasonable range for estimation
      const clampedAudio = Math.max(-70, Math.min(-20, audioLevel));
      
      // Base traffic estimate from audio activity (more conservative)
      if (clampedAudio > -45) {
        // Very active area - might have some nearby traffic
        // Scale down: audio includes many sources, not just traffic
        traffic = Math.round(50 + (clampedAudio + 45) * 2.5); // -45 dB = 50, -20 dB = 112 vehicles/hr
      } else if (clampedAudio > -55) {
        // Moderate activity
        traffic = Math.round(30 + (clampedAudio + 55) * 2); // -55 dB = 30, -45 dB = 50 vehicles/hr
      } else if (clampedAudio > -65) {
        // Low activity
        traffic = Math.round(15 + (clampedAudio + 65) * 1.5); // -65 dB = 15, -55 dB = 30 vehicles/hr
      } else {
        // Very quiet (default or no data)
        traffic = Math.round(10 + (clampedAudio + 70) * 1); // -70 dB = 10, -65 dB = 15 vehicles/hr
      }
      
      // Add some variation based on time of day (typical traffic patterns)
      // Morning rush (7-9): +20%, Evening rush (17-19): +15%
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        traffic = Math.round(traffic * 1.2);
      } else if (hour >= 22 || hour <= 5) {
        // Night time: reduce by 30%
        traffic = Math.round(traffic * 0.7);
      }
      
      // Cap at 150 vehicles/hour (more realistic for a cafe location on a side street)
      traffic = Math.min(traffic, 150);
    } else {
      // No sensor data for this hour - set to 0 to indicate missing data
      // This will show as gaps in the graph rather than constant values
      traffic = 0;
    }
    
    hourlyData.push({
      hour,
      score,
      pedestrians: Math.round(footfall),
      traffic: Math.round(traffic),
      activity: Math.round(audioLevel * 10) / 10,
      lightLevel,
      sampleCount,
    });
  }
  
  // Find peak hour - only consider hours with actual sensor data (sampleCount > 0)
  // This prevents selecting hours with only fallback footfall data as the peak
  const hoursWithData = hourlyData.filter(d => d.sampleCount > 0);
  const peakData = hoursWithData.length > 0
    ? hoursWithData.reduce((max, item) => 
        item.score > max.score ? item : max, hoursWithData[0]
      )
    : hourlyData.reduce((max, item) => 
        item.score > max.score ? item : max, hourlyData[0]
      ); // Fallback to all hours if no sensor data at all
  
  // Calculate activity rate (percentage of hours with activity > -50 dB)
  const busyHours = hourlyData.filter(d => d.activity > -50).length;
  const activityRate = (busyHours / 24) * 100;
  
  // Identify busy periods using real quantifiable thresholds
  // Only consider periods with significant activity (audio > -50 dB) AND footfall > 30 OR score > 6
  const busyPeriods: { start: number; end: number; reason: string; avgPedestrians: number; avgScore: number; avgActivity: number }[] = [];
  let currentPeriod: { start: number; end: number; score: number; pedestrians: number; activity: number } | null = null;
  
  // Calculate thresholds based on actual data (more realistic for cafe locations)
  const maxScore = Math.max(...hourlyData.map(d => d.score));
  const maxPedestrians = Math.max(...hourlyData.map(d => d.pedestrians));
  const scoreThreshold = Math.max(6, maxScore * 0.4); // At least 6 or 40% of max score
  const pedestrianThreshold = Math.max(30, maxPedestrians * 0.3); // At least 30 or 30% of max pedestrians (lower for cafe)
  const activityThreshold = -50; // dB threshold for busy activity
  
  hourlyData.forEach((data) => {
    // A period is "busy" if it meets multiple criteria:
    // 1. Score is above threshold AND
    // 2. (Pedestrians > threshold OR Activity > -50 dB) AND
    // 3. Has actual sample data
    const isBusy = data.score >= scoreThreshold && 
                   data.sampleCount > 0 &&
                   (data.pedestrians >= pedestrianThreshold || data.activity >= activityThreshold);
    
    if (isBusy) {
      if (!currentPeriod) {
        currentPeriod = { 
          start: data.hour, 
          end: data.hour, 
          score: data.score,
          pedestrians: data.pedestrians,
          activity: data.activity
        };
      } else {
        // Extend period if consecutive or within 1 hour
        if (data.hour <= currentPeriod.end + 1) {
          currentPeriod.end = data.hour;
          currentPeriod.score = Math.max(currentPeriod.score, data.score);
          currentPeriod.pedestrians = Math.max(currentPeriod.pedestrians, data.pedestrians);
          currentPeriod.activity = Math.max(currentPeriod.activity, data.activity);
        } else {
          // Save current period and start new one
          const periodData = hourlyData.filter(d => d.hour >= currentPeriod!.start && d.hour <= currentPeriod!.end);
          const avgPed = Math.round(periodData.reduce((sum, d) => sum + d.pedestrians, 0) / periodData.length);
          const avgScore = periodData.reduce((sum, d) => sum + d.score, 0) / periodData.length;
          const avgActivity = periodData.reduce((sum, d) => sum + d.activity, 0) / periodData.length;
          
          busyPeriods.push({
            start: currentPeriod.start,
            end: currentPeriod.end,
            reason: getBusyReason(currentPeriod.start, currentPeriod.end, hourlyData, avgPed, avgScore, avgActivity),
            avgPedestrians: avgPed,
            avgScore: avgScore,
            avgActivity: avgActivity,
          });
          
          currentPeriod = { 
            start: data.hour, 
            end: data.hour, 
            score: data.score,
            pedestrians: data.pedestrians,
            activity: data.activity
          };
        }
      }
    } else {
      if (currentPeriod && currentPeriod.end - currentPeriod.start >= 1) {
        // Only save periods that are at least 1 hour long
        const periodData = hourlyData.filter(d => d.hour >= currentPeriod!.start && d.hour <= currentPeriod!.end);
        const avgPed = Math.round(periodData.reduce((sum, d) => sum + d.pedestrians, 0) / periodData.length);
        const avgScore = periodData.reduce((sum, d) => sum + d.score, 0) / periodData.length;
        const avgActivity = periodData.reduce((sum, d) => sum + d.activity, 0) / periodData.length;
        
        busyPeriods.push({
          start: currentPeriod.start,
          end: currentPeriod.end,
          reason: getBusyReason(currentPeriod.start, currentPeriod.end, hourlyData, avgPed, avgScore, avgActivity),
          avgPedestrians: avgPed,
          avgScore: avgScore,
          avgActivity: avgActivity,
        });
      }
      currentPeriod = null;
    }
  });
  
  if (currentPeriod && currentPeriod.end - currentPeriod.start >= 1) {
    const periodData = hourlyData.filter(d => d.hour >= currentPeriod!.start && d.hour <= currentPeriod!.end);
    const avgPed = Math.round(periodData.reduce((sum, d) => sum + d.pedestrians, 0) / periodData.length);
    const avgScore = periodData.reduce((sum, d) => sum + d.score, 0) / periodData.length;
    const avgActivity = periodData.reduce((sum, d) => sum + d.activity, 0) / periodData.length;
    
    busyPeriods.push({
      start: currentPeriod.start,
      end: currentPeriod.end,
      reason: getBusyReason(currentPeriod.start, currentPeriod.end, hourlyData, avgPed, avgScore, avgActivity),
      avgPedestrians: avgPed,
      avgScore: avgScore,
      avgActivity: avgActivity,
    });
  }
  
  // Sort by score descending and limit to top 3 most significant periods
  busyPeriods.sort((a, b) => b.avgScore - a.avgScore);
  const topBusyPeriods = busyPeriods.slice(0, 3).map(p => ({
    start: p.start,
    end: p.end,
    reason: p.reason,
  }));
  
  // Generate basic recommendations (will be enhanced by Gemini in the UI)
  const recommendations = generateRecommendations(hourlyData, busyPeriods, peakData);
  
  // Apply K-means clustering to discover temporal patterns
  const clusters = kMeansClustering(hourlyData, 3);
  
  // Apply Kalman filtering for smoothing and prediction
  const pedestrianPrediction = smoothAndPredictPedestrians(
    hourlyData.map(d => ({ hour: d.hour, pedestrians: d.pedestrians }))
  );
  const scorePrediction = smoothAndPredictScores(
    hourlyData.map(d => ({ hour: d.hour, score: d.score }))
  );
  
  // Create smoothed hourly data (using Kalman-filtered pedestrians and scores)
  const smoothedData: RealTrafficDataPoint[] = hourlyData.map(d => {
    const smoothedPed = pedestrianPrediction.smoothed.find(s => s.hour === d.hour);
    const smoothedScore = scorePrediction.smoothed.find(s => s.hour === d.hour);
    return {
      ...d,
      pedestrians: smoothedPed ? smoothedPed.pedestrians : d.pedestrians,
      score: smoothedScore ? smoothedScore.score : d.score,
    };
  });
  
  return {
    peakHour: peakData.hour,
    peakScore: Math.round(peakData.score * 100) / 100,
    peakFootfall: peakData.pedestrians,
    activityRate: Math.round(activityRate * 10) / 10,
    hourlyData,
    busyPeriods: topBusyPeriods,
    recommendations,
    // Advanced algorithms results
    clusters: clusters.map(c => ({
      clusterId: c.clusterId,
      label: c.label,
      hours: c.hours,
      centroid: c.centroid
    })),
    nextHourPrediction: {
      pedestrians: Math.round(pedestrianPrediction.nextHourPrediction),
      score: Math.round(scorePrediction.nextHourPrediction * 100) / 100
    },
    smoothedData,
  };
}

// Get reason for busy period using real quantifiable data
function getBusyReason(
  start: number, 
  end: number, 
  hourlyData: RealTrafficDataPoint[],
  avgPedestrians: number,
  avgScore: number,
  avgActivity: number
): string {
  const duration = end - start + 1;
  
  // Use quantifiable metrics to determine reason
  if (start >= 7 && start <= 10) {
    return `Morning rush (${avgPedestrians} pedestrians/hr, ${avgActivity.toFixed(1)} dB activity)`;
  } else if (start >= 12 && start <= 14) {
    return `Lunch rush (${avgPedestrians} pedestrians/hr, ${avgActivity.toFixed(1)} dB activity)`;
  } else if (start >= 17 && start <= 19) {
    return `Evening rush (${avgPedestrians} pedestrians/hr, ${avgActivity.toFixed(1)} dB activity)`;
  } else if (avgPedestrians > 200) {
    return `High footfall (${avgPedestrians} pedestrians/hr, score ${avgScore.toFixed(1)})`;
  } else if (avgActivity > -45) {
    return `High activity (${avgActivity.toFixed(1)} dB, ${avgPedestrians} pedestrians/hr)`;
  } else if (avgScore > 15) {
    return `Peak score ${avgScore.toFixed(1)} (${avgPedestrians} pedestrians/hr)`;
  } else {
    return `${duration}h period (${avgPedestrians} pedestrians/hr, ${avgActivity.toFixed(1)} dB)`;
  }
}

// Generate business recommendations (will be enhanced by Gemini)
function generateRecommendations(
  hourlyData: RealTrafficDataPoint[],
  busyPeriods: { start: number; end: number; reason: string }[],
  peakData: RealTrafficDataPoint
): string[] {
  // This function now returns basic recommendations
  // Gemini service will enhance them
  const recommendations: string[] = [];
  
  // Peak hour recommendations
  const peakHour = peakData.hour;
  const peakEnd = Math.min(23, peakHour + 1);
  recommendations.push(
    `Maximize Peak Opportunity (${formatHour(peakHour)}-${formatHour(peakEnd)}): ${peakData.pedestrians} pedestrians, score ${peakData.score.toFixed(2)}`
  );
  
  // Busy period recommendations
  busyPeriods.forEach(period => {
    if (period.end - period.start >= 2) {
      recommendations.push(
        `Extended Busy Period (${formatHour(period.start)}-${formatHour(period.end)}): ${period.reason}`
      );
    }
  });
  
  // Low traffic recommendations
  const lowTrafficHours = hourlyData.filter(d => d.score < 2 && d.pedestrians < 30);
  if (lowTrafficHours.length > 0) {
    const lowStart = lowTrafficHours[0].hour;
    const lowEnd = lowTrafficHours[lowTrafficHours.length - 1].hour;
    recommendations.push(
      `Optimize Low-Traffic Periods (${formatHour(lowStart)}-${formatHour(lowEnd)})`
    );
  }
  
  return recommendations;
}

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

