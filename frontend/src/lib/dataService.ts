// Data service to load and process traffic flow data
// Loads from automated_collection and manual_collection folders

export interface TrafficDataPoint {
  hour: number;
  score: number;
  pedestrians: number;
  traffic: number;
  activity: number;
}

export interface BusinessData {
  name: string;
  lat: number;
  lon: number;
  automatedSamples: any[];
  manualData?: any;
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Load DLR footfall data
export async function loadFootfallData(): Promise<any[]> {
  try {
    // Try multiple possible paths (Vite serves public folder at root)
    const paths = [
      '/automated_collection/open-data/dlr_footfall/date=2025-11-07/1762547729454.csv',
      './automated_collection/open-data/dlr_footfall/date=2025-11-07/1762547729454.csv',
    ];
    
    let response: Response | null = null;
    for (const path of paths) {
      try {
        response = await fetch(path);
        if (response.ok) break;
      } catch (e) {
        continue;
      }
    }
    
    if (!response || !response.ok) {
      console.warn('Could not load footfall data, using fallback');
      return generateFallbackFootfallData();
    }
    
    const text = await response.text();
    return parseFootfallCSV(text);
  } catch (error) {
    console.error('Error loading footfall data:', error);
    return generateFallbackFootfallData();
  }
}

// Parse footfall CSV data
function parseFootfallCSV(text: string): any[] {
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',');
  const pedestrianCols = headers.filter((h, i) => 
    h.includes('Pedestrian') && !h.includes('IN') && !h.includes('OUT')
  );
  
  // Track hourly data for averaging
  const hourlyData = new Map<number, { sum: number; count: number }>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;
    
    const timeStr = values[0].replace(/"/g, '');
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) continue;
    
    const hour = date.getHours();
    
    let totalPedestrians = 0;
    pedestrianCols.forEach((col, idx) => {
      const colIdx = headers.indexOf(col);
      if (colIdx >= 0 && values[colIdx]) {
        const val = parseFloat(values[colIdx]);
        // Cap individual values to prevent unrealistic numbers
        if (!isNaN(val) && val >= 0 && val < 100000) {
          totalPedestrians += val;
        }
      }
    });
    
    // Cap total per record
    if (totalPedestrians > 0 && totalPedestrians < 100000) {
      const current = hourlyData.get(hour) || { sum: 0, count: 0 };
      hourlyData.set(hour, {
        sum: current.sum + totalPedestrians,
        count: current.count + 1
      });
    }
  }
  
  // Convert to array with averaged values
  const data: any[] = [];
  for (const [hour, stats] of hourlyData.entries()) {
    const average = stats.count > 0 ? stats.sum / stats.count : 0;
    // Cap at 10,000 pedestrians per hour
    const cappedAverage = Math.min(average, 10000);
    data.push({ hour, pedestrians: cappedAverage, time: `2025-11-07 ${hour.toString().padStart(2, '0')}:00:00` });
  }
  
  return data;
}

// Generate fallback footfall data if file can't be loaded
function generateFallbackFootfallData(): any[] {
  const data: any[] = [];
  for (let hour = 0; hour < 24; hour++) {
    // Simulate typical footfall pattern
    let pedestrians = 0;
    if (hour >= 6 && hour <= 9) pedestrians = 50 + hour * 30; // Morning rush
    else if (hour >= 12 && hour <= 14) pedestrians = 500 + (hour === 13 ? 80 : 0); // Lunch peak
    else if (hour >= 17 && hour <= 19) pedestrians = 400 - (hour - 17) * 20; // Evening
    else if (hour >= 20) pedestrians = Math.max(0, 300 - (hour - 20) * 30); // Night
    else pedestrians = Math.max(5, 20 - hour * 2); // Early morning
    
    data.push({ hour, pedestrians, time: `2025-01-01 ${hour.toString().padStart(2, '0')}:00:00` });
  }
  return data;
}

// Load session data (Costa and TBC)
export async function loadSessionData(): Promise<{ costa: any[], tbc: any[] }> {
  const costa: any[] = [];
  const tbc: any[] = [];
  
  try {
    // Load all session JSON files - Vite serves public folder at root
    const sessionFiles = [
      { 
        paths: [
          '/automated_collection/sessions/date=2025-11-06/device=android-7ef705ff/1762460820283.json',
          './automated_collection/sessions/date=2025-11-06/device=android-7ef705ff/1762460820283.json',
        ],
        tag: 'Costa'
      },
      { 
        paths: [
          '/automated_collection/sessions/date=2025-11-07/device=android-50dd91de/1762520691350.json',
          './automated_collection/sessions/date=2025-11-07/device=android-50dd91de/1762520691350.json',
        ],
        tag: 'Costa'
      },
      { 
        paths: [
          '/automated_collection/sessions/date=2025-11-07/device=android-83e6dd1a/1762519995678.json',
          './automated_collection/sessions/date=2025-11-07/device=android-83e6dd1a/1762519995678.json',
        ],
        tag: 'Costa'
      },
    ];
    
    for (const fileInfo of sessionFiles) {
      let session: any = null;
      
      for (const filePath of fileInfo.paths) {
        try {
          const response = await fetch(filePath);
          if (response.ok) {
            session = await response.json();
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!session) continue;
      
      try {
        const samples = typeof session.samples === 'string' 
          ? JSON.parse(session.samples) 
          : session.samples;
        
        samples.forEach((sample: any) => {
          const datetime = new Date(sample.ts);
          const hour = datetime.getHours();
          
          const processedSample = {
            ...sample,
            datetime,
            hour,
            date: session.date,
            deviceId: session.deviceId,
            sessionId: session.sessionId,
          };
          
          if (sample.siteTag === 'Costa') {
            costa.push(processedSample);
          } else if (sample.siteTag === 'TBC' || sample.siteTag?.includes('Two') || sample.siteTag?.includes('Boy')) {
            tbc.push(processedSample);
          }
        });
      } catch (err) {
        console.warn(`Could not parse session data:`, err);
      }
    }
  } catch (error) {
    console.error('Error loading session data:', error);
  }
  
  return { costa, tbc };
}

// Calculate walk-by potential score
export function calculateWalkByScore(
  hour: number,
  footfallData: any[],
  sessionData: any[],
  trafficEstimate: number = 0
): TrafficDataPoint {
  let pedestrians = 0;
  let activity = -70; // Default quiet
  
  // Get footfall for this hour (already averaged, so just take the value)
  const hourFootfall = footfallData.filter(d => d.hour === hour);
  if (hourFootfall.length > 0) {
    // Data is already averaged per hour, so just take the first value
    pedestrians = hourFootfall[0].pedestrians;
  }
  
  // Get activity (audio) for this hour
  const hourSessions = sessionData.filter(d => d.hour === hour);
  if (hourSessions.length > 0) {
    const audioLevels = hourSessions.map(s => s.audioDb).filter(a => a != null);
    if (audioLevels.length > 0) {
      activity = audioLevels.reduce((sum, a) => sum + a, 0) / audioLevels.length;
    }
  }
  
  // Calculate composite score
  const footfallComponent = pedestrians / 100;
  const activityComponent = Math.max(0, (activity + 70) / 10);
  const trafficComponent = trafficEstimate / 50;
  const score = footfallComponent + activityComponent + trafficComponent;
  
  // Estimate traffic (simplified - in real app would load SCATS data)
  // Cap pedestrians at reasonable value before calculation
  const cappedPedestrians = Math.min(pedestrians, 10000);
  const traffic = Math.max(500, Math.min(cappedPedestrians * 20 + (activity > -50 ? 5000 : 2000), 50000));
  
  return {
    hour,
    score: Math.max(0, score),
    pedestrians: Math.round(pedestrians),
    traffic: Math.round(traffic),
    activity: Math.round(activity * 10) / 10,
  };
}

// Generate 24-hour traffic data
export async function generateTrafficData(business?: 'costa' | 'tbc'): Promise<TrafficDataPoint[]> {
  // Use real data service if business is specified
  if (business) {
    try {
      const { generateRealTrafficData } = await import('./realDataService');
      const realMetrics = await generateRealTrafficData(business);
      // Convert to TrafficDataPoint format
      return realMetrics.hourlyData.map(hd => ({
        hour: hd.hour,
        score: hd.score,
        pedestrians: hd.pedestrians,
        traffic: hd.traffic,
        activity: hd.activity,
      }));
    } catch (error) {
      console.warn('Could not load real data, using fallback:', error);
    }
  }
  
  // Fallback to original method for combined view
  const [footfallData, sessionDataObj] = await Promise.all([
    loadFootfallData(),
    loadSessionData(),
  ]);
  
  // Use business-specific session data or combine both
  const sessionData = business 
    ? (business === 'costa' ? sessionDataObj.costa : sessionDataObj.tbc)
    : [...sessionDataObj.costa, ...sessionDataObj.tbc];
  
  const trafficData: TrafficDataPoint[] = [];
  
  for (let hour = 0; hour < 24; hour++) {
    const dataPoint = calculateWalkByScore(hour, footfallData, sessionData);
    trafficData.push(dataPoint);
  }
  
  return trafficData;
}

// Load business data
export async function loadBusinessData(business: 'costa' | 'tbc'): Promise<BusinessData> {
  const businesses = {
    costa: {
      name: '1 Dawson St, Dublin 2',
      lat: 53.3441,
      lon: -6.2572,
    },
    tbc: {
      name: '375 N Circular Rd, Phibsborough, Dublin 7',
      lat: 53.3410518,
      lon: -6.2512877,
    },
  };
  
  const sessionDataObj = await loadSessionData();
  const automatedSamples = business === 'costa' ? sessionDataObj.costa : sessionDataObj.tbc;
  
  return {
    ...businesses[business],
    automatedSamples,
  };
}

// Get data statistics
export function getDataStats(trafficData: TrafficDataPoint[]) {
  if (trafficData.length === 0) {
    return {
      peakData: { hour: 0, score: 0, pedestrians: 0, traffic: 0, activity: -70 },
      totalPedestrians: 0,
      avgActivity: -70,
      activityRate: 0,
    };
  }
  
  const peakData = trafficData.reduce((max, item) => 
    item.score > max.score ? item : max, trafficData[0]
  );
  
  const totalPedestrians = trafficData.reduce((sum, d) => sum + d.pedestrians, 0);
  const avgActivity = trafficData.reduce((sum, d) => sum + d.activity, 0) / trafficData.length;
  const busySamples = trafficData.filter(d => d.activity > -50).length;
  const activityRate = (busySamples / trafficData.length) * 100;
  
  return {
    peakData,
    totalPedestrians,
    avgActivity,
    activityRate: Math.round(activityRate * 10) / 10,
  };
}

