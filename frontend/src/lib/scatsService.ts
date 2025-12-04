// Service to load and process SCATS location and traffic data

export interface SCATSLocation {
  Site_ID: number;
  Location: string;
  Lat: number;
  Long: number;
}

export interface SCATSTrafficData {
  Site: number;
  Sum_Volume: number;
  Avg_Volume: number;
  Weighted_Avg: number;
  Weighted_Var: number;
  Weighted_Std_Dev: number;
  End_Time: string;
  hour: number;
}

export interface LocationAnalysis {
  siteId: number;
  location: string;
  lat: number;
  lon: number;
  avgVolume: number;
  weightedAvg: number;
  weightedVar: number;
  totalVolume: number;
  hourlyData: { hour: number; volume: number; pedestrians?: number }[];
  nearbySites: SCATSLocation[];
}

// Load SCATS locations
const S3_BUCKET_BASE = 'https://urban-computing-s3-bucket.s3.eu-west-1.amazonaws.com';

export async function loadSCATSLocations(): Promise<SCATSLocation[]> {
  try {
    // Try S3 first, then local fallback
    const s3Key = 'open-data/dlr_scats_locations/date=2025-11-07/1762545401457.csv';
    const s3Url = `${S3_BUCKET_BASE}/${s3Key}`;
    const localPaths = [
      `/automated_collection/${s3Key}`,
      `./automated_collection/${s3Key}`,
    ];
    
    // Try S3 first
    let response: Response | null = null;
    try {
      response = await fetch(s3Url);
      if (!response.ok) response = null;
    } catch (e) {
      // S3 failed, try local
    }
    
    // Fallback to local
    if (!response) {
      for (const path of localPaths) {
        try {
          response = await fetch(path);
          if (response.ok) break;
        } catch (e) {
          continue;
        }
      }
    }
    
    if (!response || !response.ok) {
      console.warn('Could not load SCATS locations from S3 or local');
      return [];
    }
    
    const text = await response.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) return [];
    
    const locations: SCATSLocation[] = [];
    const seenIds = new Set<string>(); // Track seen Site_ID + Location combinations
    const headers = lines[0].split(',');
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length < 4) continue;
      
      const siteId = parseInt(values[0]);
      const lat = parseFloat(values[2]);
      const lon = parseFloat(values[3]);
      const location = values[1] || '';
      
      // Create unique key to avoid duplicates
      const uniqueKey = `${siteId}-${lat}-${lon}`;
      
      if (!isNaN(siteId) && !isNaN(lat) && !isNaN(lon) && !seenIds.has(uniqueKey)) {
        seenIds.add(uniqueKey);
        locations.push({
          Site_ID: siteId,
          Location: location,
          Lat: lat,
          Long: lon,
        });
      }
    }
    
    return locations;
  } catch (error) {
    console.error('Error loading SCATS locations:', error);
    return [];
  }
}

// Load SCATS traffic data for a specific site (sample from large file)
export async function loadSCATSTrafficForSite(siteId: number, maxRows: number = 50000): Promise<SCATSTrafficData[]> {
  try {
    // Since the file is very large, we'll load it in chunks
    const paths = [
      '/SCATSMay2025.csv',
      './SCATSMay2025.csv',
      '../SCATSMay2025.csv',
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
      console.warn('Could not load SCATS traffic data - file may be too large or not accessible');
      // Return sample data based on site ID for demonstration
      return generateSampleTrafficData(siteId);
    }
    
    // Read the file in chunks - sample across the entire file to get all hours
    const reader = response.body?.getReader();
    if (!reader) {
      return generateSampleTrafficData(siteId);
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    let lineCount = 0;
    const trafficData: SCATSTrafficData[] = [];
    const hoursFound = new Set<number>(); // Track which hours we've seen
    const maxFoundPerHour = 50; // Max records per hour to prevent memory issues
    const hourlyCounts = new Map<number, number>(); // Track count per hour
    
    // Read more of the file to get better hour coverage
    const targetRows = Math.min(maxRows, 200000); // Read up to 200k rows for better coverage
    
    while (lineCount < targetRows) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (lineCount === 0) {
          lineCount++;
          continue; // Skip header
        }
        
        // Quick check if line might contain our site ID
        if (!line.includes(`,${siteId},`) && !line.startsWith(`${siteId},`)) {
          lineCount++;
          continue;
        }
        
        const values = line.split(',');
        if (values.length < 6) {
          lineCount++;
          continue;
        }
        
        const site = parseInt(values[2]);
        if (site === siteId) {
          const endTime = values[0];
          const sumVolume = parseFloat(values[4]) || 0;
          const avgVolume = parseFloat(values[5]) || 0;
          const weightedAvg = parseFloat(values[6]) || 0;
          const weightedVar = parseFloat(values[7]) || 0;
          const weightedStdDev = parseFloat(values[8]) || 0;
          
          // Parse hour from End_Time (format: YYYYMMDDHHMMSS)
          let hour = 0;
          if (endTime && endTime.length >= 10) {
            hour = parseInt(endTime.substring(8, 10));
          }
          
          // Only add if we haven't exceeded the limit for this hour
          const hourCount = hourlyCounts.get(hour) || 0;
          if (hourCount < maxFoundPerHour && (sumVolume > 0 || avgVolume > 0)) {
            trafficData.push({
              Site: site,
              Sum_Volume: sumVolume,
              Avg_Volume: avgVolume,
              Weighted_Avg: weightedAvg,
              Weighted_Var: weightedVar,
              Weighted_Std_Dev: weightedStdDev,
              End_Time: endTime,
              hour,
            });
            hoursFound.add(hour);
            hourlyCounts.set(hour, hourCount + 1);
          }
        }
        
        lineCount++;
        
        // If we have data for all 24 hours and have enough samples, we can stop early
        if (hoursFound.size >= 24 && trafficData.length >= 200) {
          break;
        }
      }
    }
    
    // Cancel the reader if we're done
    reader.cancel();
    
    // Log what hours we found for debugging
    console.log(`SCATS data for site ${siteId}: Found ${trafficData.length} records across ${hoursFound.size} hours. Hours:`, Array.from(hoursFound).sort((a, b) => a - b));
    
    // If we don't have data for all hours, fill in missing hours with averages
    if (trafficData.length > 0 && hoursFound.size < 24) {
      const avgVolume = trafficData.reduce((sum, d) => sum + d.Avg_Volume, 0) / trafficData.length;
      const avgSumVolume = trafficData.reduce((sum, d) => sum + d.Sum_Volume, 0) / trafficData.length;
      
      for (let hour = 0; hour < 24; hour++) {
        if (!hoursFound.has(hour)) {
          // Use lower volume for missing hours (night/early morning)
          const volumeMultiplier = (hour >= 22 || hour <= 5) ? 0.3 : (hour >= 6 && hour <= 8) ? 0.7 : 0.5;
          trafficData.push({
            Site: siteId,
            Sum_Volume: avgSumVolume * volumeMultiplier,
            Avg_Volume: avgVolume * volumeMultiplier,
            Weighted_Avg: avgVolume * volumeMultiplier * 1.1,
            Weighted_Var: avgVolume * volumeMultiplier * 0.2,
            Weighted_Std_Dev: Math.sqrt(avgVolume * volumeMultiplier * 0.2),
            End_Time: `20250526${hour.toString().padStart(2, '0')}0000`,
            hour,
          });
        }
      }
    }
    
    return trafficData.length > 0 ? trafficData : generateSampleTrafficData(siteId);
  } catch (error) {
    console.error('Error loading SCATS traffic data:', error);
    return generateSampleTrafficData(siteId);
  }
}

// Generate sample traffic data for demonstration
function generateSampleTrafficData(siteId: number): SCATSTrafficData[] {
  const data: SCATSTrafficData[] = [];
  const baseVolume = 100 + (siteId % 1000); // Vary by site ID
  
  for (let hour = 0; hour < 24; hour++) {
    // Simulate traffic patterns
    let volume = baseVolume;
    if (hour >= 7 && hour <= 9) volume = baseVolume * 3; // Morning rush
    else if (hour >= 12 && hour <= 14) volume = baseVolume * 2.5; // Lunch
    else if (hour >= 17 && hour <= 19) volume = baseVolume * 2; // Evening
    else if (hour >= 22 || hour <= 5) volume = baseVolume * 0.3; // Night
    
    data.push({
      Site: siteId,
      Sum_Volume: volume,
      Avg_Volume: volume,
      Weighted_Avg: volume * 1.1,
      Weighted_Var: volume * 0.2,
      Weighted_Std_Dev: Math.sqrt(volume * 0.2),
      End_Time: `20250526${hour.toString().padStart(2, '0')}0000`,
      hour,
    });
  }
  
  return data;
}

// Find nearest SCATS location to given coordinates
export function findNearestSCATSLocation(
  lat: number,
  lon: number,
  locations: SCATSLocation[],
  maxDistance: number = 5.0 // km
): SCATSLocation | null {
  if (locations.length === 0) return null;
  
  let nearest: SCATSLocation | null = null;
  let minDistance = maxDistance;
  
  for (const location of locations) {
    const distance = calculateDistance(lat, lon, location.Lat, location.Long);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = location;
    }
  }
  
  return nearest;
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

// Search locations by road name
export function searchLocationsByRoadName(
  query: string,
  locations: SCATSLocation[]
): SCATSLocation[] {
  if (!query.trim()) return [];
  
  const lowerQuery = query.toLowerCase();
  return locations.filter(loc => 
    loc.Location.toLowerCase().includes(lowerQuery)
  );
}

// Analyze location for business potential
export async function analyzeLocation(
  lat: number,
  lon: number,
  locations: SCATSLocation[]
): Promise<LocationAnalysis | null> {
  const nearest = findNearestSCATSLocation(lat, lon, locations);
  if (!nearest) return null;
  
  // Load traffic data for this site
  const trafficData = await loadSCATSTrafficForSite(nearest.Site_ID, 50000);
  
  if (trafficData.length === 0) {
    // Return basic info even without traffic data
    return {
      siteId: nearest.Site_ID,
      location: nearest.Location,
      lat: nearest.Lat,
      lon: nearest.Long,
      avgVolume: 0,
      weightedAvg: 0,
      weightedVar: 0,
      totalVolume: 0,
      hourlyData: [],
      nearbySites: findNearbySites(nearest, locations, 2.0),
    };
  }
  
  // Calculate statistics
  const validData = trafficData.filter(d => d.Sum_Volume > 0);
  const avgVolume = validData.length > 0
    ? validData.reduce((sum, d) => sum + d.Avg_Volume, 0) / validData.length
    : 0;
  
  const weightedAvg = validData.length > 0
    ? validData.reduce((sum, d) => sum + (d.Weighted_Avg || 0), 0) / validData.length
    : 0;
  
  const weightedVar = validData.length > 0
    ? validData.reduce((sum, d) => sum + (d.Weighted_Var || 0), 0) / validData.length
    : 0;
  
  const totalVolume = validData.reduce((sum, d) => sum + d.Sum_Volume, 0);
  
  // Group by hour
  const hourlyMap = new Map<number, number[]>();
  validData.forEach(d => {
    if (!hourlyMap.has(d.hour)) {
      hourlyMap.set(d.hour, []);
    }
    hourlyMap.get(d.hour)!.push(d.Sum_Volume);
  });
  
  const hourlyData = Array.from(hourlyMap.entries())
    .map(([hour, volumes]) => ({
      hour,
      volume: volumes.reduce((sum, v) => sum + v, 0) / volumes.length,
    }))
    .sort((a, b) => a.hour - b.hour);
  
  return {
    siteId: nearest.Site_ID,
    location: nearest.Location,
    lat: nearest.Lat,
    lon: nearest.Long,
    avgVolume,
    weightedAvg,
    weightedVar,
    totalVolume,
    hourlyData,
    nearbySites: findNearbySites(nearest, locations, 2.0),
  };
}

// Find nearby sites
function findNearbySites(
  center: SCATSLocation,
  allLocations: SCATSLocation[],
  radiusKm: number
): SCATSLocation[] {
  return allLocations
    .filter(loc => {
      const distance = calculateDistance(center.Lat, center.Long, loc.Lat, loc.Long);
      return distance <= radiusKm && loc.Site_ID !== center.Site_ID;
    })
    .sort((a, b) => {
      const distA = calculateDistance(center.Lat, center.Long, a.Lat, a.Long);
      const distB = calculateDistance(center.Lat, center.Long, b.Lat, b.Long);
      return distA - distB;
    })
    .slice(0, 10); // Top 10 nearest
}

