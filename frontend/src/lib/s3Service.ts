// Service for fetching data from S3 bucket
// S3 Bucket: urban-computing-s3-bucket
// Region: eu-west-1
// 
// Note: For CORS to work, the S3 bucket must have CORS configuration allowing
// requests from the frontend domain. Example CORS configuration:
// [
//   {
//     "AllowedHeaders": ["*"],
//     "AllowedMethods": ["GET", "HEAD"],
//     "AllowedOrigins": ["*"], // Or specific domain in production
//     "ExposeHeaders": [],
//     "MaxAgeSeconds": 3000
//   }
// ]

const S3_BUCKET_NAME = 'urban-computing-s3-bucket';
const S3_REGION = 'eu-west-1';
const S3_BASE_URL = `https://${S3_BUCKET_NAME}.s3.${S3_REGION}.amazonaws.com`;

/**
 * Construct S3 URL for a given key
 */
export function getS3Url(key: string): string {
  // Remove leading slash if present
  const cleanKey = key.startsWith('/') ? key.slice(1) : key;
  return `${S3_BASE_URL}/${cleanKey}`;
}

/**
 * List session files from S3 for a given date range
 * Since we can't directly list S3 objects from frontend without AWS SDK,
 * we'll try common date patterns and known file structures
 */
export async function listSessionFiles(
  startDate?: string,
  endDate?: string
): Promise<string[]> {
  // For now, we'll try to fetch known date patterns
  // In production, this would be done via a backend API or S3 list operation
  
  const dates: string[] = [];
  const today = new Date();
  
  // Generate date range (last 7 days by default)
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  // Try to discover session files by attempting common patterns
  const sessionFiles: string[] = [];
  
  for (const date of dates) {
    // Try common device ID patterns and session IDs
    // In a real implementation, this would use S3 listObjects API via backend
    const commonPatterns = [
      `sessions/date=${date}/device=android-*/`,
    ];
    
    // For now, return empty and let the calling code specify exact paths
    // Or we can try to fetch a known structure
  }
  
  return sessionFiles;
}

/**
 * Fetch session data from S3
 * Tries multiple date/device combinations to find available sessions
 */
export async function fetchSessionFromS3(
  date: string,
  deviceId: string,
  sessionId: string
): Promise<any | null> {
  const key = `sessions/date=${date}/device=${deviceId}/${sessionId}.json`;
  const url = getS3Url(key);
  
  try {
    const response = await fetch(url);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn(`Could not fetch session from S3: ${key}`, error);
  }
  
  return null;
}

/**
 * Fetch all sessions from S3 for recent dates
 * Attempts to discover and load available session files
 */
export async function fetchAllSessionsFromS3(
  business?: 'costa' | 'tbc'
): Promise<any[]> {
  const sessions: any[] = [];
  const today = new Date();
  
  // Try last 30 days
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Try to discover sessions by attempting common patterns
    // Note: In production, use S3 listObjects API via backend
    // For now, we'll try known device patterns or use a backend endpoint
    
    // Common device ID patterns (from known sessions)
    const devicePatterns = [
      'android-7ef705ff',
      'android-50dd91de',
      'android-83e6dd1a',
    ];
    
    for (const deviceId of devicePatterns) {
      // Try to fetch - we'd need session IDs, which we don't know
      // This is a limitation of frontend-only S3 access
      // In production, implement a backend API that lists S3 objects
    }
  }
  
  return sessions;
}

/**
 * Fetch open data file from S3
 */
export async function fetchOpenDataFromS3(
  dataset: 'dlr_footfall' | 'dlr_scats_locations' | 'dcc_scats_volume',
  date: string,
  filename?: string
): Promise<string | null> {
  // Construct S3 key based on dataset and date
  let key: string;
  
  if (filename) {
    key = `open-data/${dataset}/date=${date}/${filename}`;
  } else {
    // Try to find the most recent file for this date
    // In production, use S3 listObjects to find files
    // For now, try common timestamp patterns
    const timestamp = Date.now();
    const ext = dataset === 'dcc_scats_volume' ? 'zip' : 'csv';
    key = `open-data/${dataset}/date=${date}/${timestamp}.${ext}`;
  }
  
  const url = getS3Url(key);
  
  try {
    const response = await fetch(url);
    if (response.ok) {
      return await response.text();
    }
  } catch (error) {
    console.warn(`Could not fetch open data from S3: ${key}`, error);
  }
  
  return null;
}

/**
 * List available open data files for a dataset
 * Returns most recent file for a given date
 */
export async function getLatestOpenDataFile(
  dataset: 'dlr_footfall' | 'dlr_scats_locations' | 'dcc_scats_volume',
  date: string
): Promise<string | null> {
  // Since we can't list S3 objects from frontend directly,
  // we'll try common patterns or use a backend API
  // For now, try fetching with a recent timestamp pattern
  
  const ext = dataset === 'dcc_scats_volume' ? 'zip' : 'csv';
  
  // Try multiple timestamp patterns (recent files)
  const timestamps = [
    Date.now(),
    Date.now() - 86400000, // 1 day ago
    Date.now() - 172800000, // 2 days ago
  ];
  
  for (const ts of timestamps) {
    const key = `open-data/${dataset}/date=${date}/${ts}.${ext}`;
    const url = getS3Url(key);
    
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return await fetchOpenDataFromS3(dataset, date, `${ts}.${ext}`);
      }
    } catch (error) {
      continue;
    }
  }
  
  return null;
}

