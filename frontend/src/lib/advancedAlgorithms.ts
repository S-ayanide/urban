// Advanced data fusion algorithms: K-means clustering and Kalman filtering

export interface ClusterResult {
  clusterId: number;
  label: string; // 'quiet', 'moderate', 'busy'
  hours: number[];
  centroid: number[];
}

export interface KalmanState {
  x: number;      // State estimate
  P: number;      // Error covariance
  Q: number;      // Process noise covariance
  R: number;      // Measurement noise covariance
}

export interface KalmanResult {
  smoothed: number[];
  predicted: number;
  state: KalmanState;
}

/**
 * K-means clustering for temporal pattern discovery
 * Groups hours into behaviorally similar clusters (quiet, moderate, busy)
 */
export function kMeansClustering(
  hourlyData: Array<{ hour: number; activity: number; light?: number; pedestrians: number; score: number; sampleCount?: number }>,
  k: number = 3
): ClusterResult[] {
  if (hourlyData.length === 0) {
    return [];
  }

  // Filter out hours with no data
  const validData = hourlyData.filter(d => d.pedestrians > 0 || d.score > 0 || (d.activity && d.activity > -70));
  if (validData.length < k) {
    // Not enough data points for clustering
    return [];
  }

  // 1. Initialize centroids randomly from valid data points
  const centroids: number[][] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < k; i++) {
    let randomIdx: number;
    do {
      randomIdx = Math.floor(Math.random() * validData.length);
    } while (usedIndices.has(randomIdx));
    usedIndices.add(randomIdx);

    const randomHour = validData[randomIdx];
    centroids.push([
      randomHour.activity || -70,
      randomHour.light || 0,
      randomHour.pedestrians || 0,
      randomHour.score || 0
    ]);
  }

  let clusters: number[][] = [];
  let changed = true;
  let iterations = 0;
  const maxIterations = 100;

  // 2. Iterate until convergence
  while (changed && iterations < maxIterations) {
    changed = false;
    clusters = Array(k).fill(0).map(() => []);

    // Assign each hour to nearest centroid
    validData.forEach((data, idx) => {
      const features = [
        data.activity || -70,
        data.light || 0,
        data.pedestrians || 0,
        data.score || 0
      ];

      let minDist = Infinity;
      let nearestCluster = 0;

      centroids.forEach((centroid, cIdx) => {
        const dist = euclideanDistance(features, centroid);
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = cIdx;
        }
      });

      clusters[nearestCluster].push(data.hour);
    });

    // 3. Update centroids
    centroids.forEach((centroid, cIdx) => {
      const clusterHours = clusters[cIdx];
      if (clusterHours.length === 0) {
        return; // Keep centroid unchanged if cluster is empty
      }

      const clusterPoints = clusterHours.map(hour => {
        const data = validData.find(d => d.hour === hour);
        return data ? [
          data.activity || -70,
          data.light || 0,
          data.pedestrians || 0,
          data.score || 0
        ] : null;
      }).filter(p => p !== null) as number[][];

      if (clusterPoints.length > 0) {
        const newCentroid = [
          clusterPoints.reduce((sum, p) => sum + p[0], 0) / clusterPoints.length,
          clusterPoints.reduce((sum, p) => sum + p[1], 0) / clusterPoints.length,
          clusterPoints.reduce((sum, p) => sum + p[2], 0) / clusterPoints.length,
          clusterPoints.reduce((sum, p) => sum + p[3], 0) / clusterPoints.length
        ];

        // Check if centroid moved significantly
        if (euclideanDistance(centroid, newCentroid) > 0.01) {
          changed = true;
        }
        centroids[cIdx] = newCentroid;
      }
    });

    iterations++;
  }

  // 4. Calculate average scores for each cluster
  const clusterResults: ClusterResult[] = clusters.map((hours, cIdx) => {
    const avgScore = hours.length > 0
      ? hours.reduce((sum, h) => {
        const data = validData.find(d => d.hour === h);
        return sum + (data?.score || 0);
      }, 0) / hours.length
      : 0;

    return {
      clusterId: cIdx,
      label: '', // Will be assigned after sorting
      hours: hours.sort((a, b) => a - b),
      centroid: centroids[cIdx]
    };
  });

  // Sort by average score (lowest first, highest last)
  const sortedClusters = clusterResults.sort((a, b) => {
    const scoreA = a.centroid[3];
    const scoreB = b.centroid[3];
    return scoreA - scoreB;
  });

  // Label clusters relative to each other (quiet < moderate < busy)
  // Since k=3, we always have: lowest = quiet, middle = moderate, highest = busy
  sortedClusters.forEach((cluster, idx) => {
    if (idx === 0) {
      cluster.label = 'quiet';
    } else if (idx === 1) {
      cluster.label = 'moderate';
    } else {
      cluster.label = 'busy';
    }
  });

  return sortedClusters;
}

function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }
  return Math.sqrt(
    a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
  );
}

/**
 * Kalman filter for time series smoothing and prediction
 * Smooths noisy sensor readings and provides one-step-ahead predictions
 */
export function kalmanFilter(
  measurements: number[],
  initialState?: Partial<KalmanState>
): KalmanResult {
  if (measurements.length === 0) {
    return {
      smoothed: [],
      predicted: 0,
      state: {
        x: 0,
        P: 1.0,
        Q: 0.01,
        R: 0.1
      }
    };
  }

  const state: KalmanState = {
    x: initialState?.x ?? measurements[0],
    P: initialState?.P ?? 1.0,
    Q: initialState?.Q ?? 0.01,  // Process noise (how much state can change)
    R: initialState?.R ?? 0.1     // Measurement noise (sensor uncertainty)
  };

  const smoothed: number[] = [];

  // Filter each measurement
  measurements.forEach(z => {
    // Prediction step (simple constant model: x_k = x_{k-1})
    const x_pred = state.x;
    const P_pred = state.P + state.Q;

    // Update step
    const K = P_pred / (P_pred + state.R); // Kalman gain
    state.x = x_pred + K * (z - x_pred);
    state.P = (1 - K) * P_pred;

    smoothed.push(state.x);
  });

  // Predict next hour (one-step ahead, using current state)
  const predicted = state.x;

  return {
    smoothed,
    predicted,
    state: { ...state }
  };
}

/**
 * Apply Kalman filter to hourly pedestrian estimates
 * Returns smoothed data and prediction for next hour
 * Only processes hours with actual data (non-zero pedestrians) to avoid bias from missing hours
 */
export function smoothAndPredictPedestrians(
  hourlyData: Array<{ hour: number; pedestrians: number }>
): { smoothed: Array<{ hour: number; pedestrians: number; pedestriansRaw: number }>; nextHourPrediction: number } {
  // Sort by hour
  const sortedData = hourlyData.sort((a, b) => a.hour - b.hour);

  // Separate hours with data from hours without data
  const hoursWithData = sortedData.filter(d => d.pedestrians > 0);
  const hoursWithoutData = sortedData.filter(d => d.pedestrians === 0);

  // If we have less than 2 hours with data, can't do meaningful prediction
  if (hoursWithData.length < 2) {
    const lastValue = hoursWithData.length > 0 ? hoursWithData[hoursWithData.length - 1].pedestrians : 0;
    return {
      smoothed: sortedData.map(d => ({
        hour: d.hour,
        pedestrians: d.pedestrians,
        pedestriansRaw: d.pedestrians
      })),
      nextHourPrediction: lastValue
    };
  }

  // Extract pedestrian series only from hours with data
  const pedestrianSeries = hoursWithData.map(d => d.pedestrians);

  // Apply Kalman filter only to hours with data
  const { smoothed, predicted, state } = kalmanFilter(pedestrianSeries);

  // Create smoothed data points - map back to all 24 hours
  const smoothedData = sortedData.map(d => {
    if (d.pedestrians > 0) {
      // Find index in hoursWithData array
      const dataIndex = hoursWithData.findIndex(h => h.hour === d.hour);
      if (dataIndex >= 0 && smoothed[dataIndex] !== undefined) {
        return {
          hour: d.hour,
          pedestrians: smoothed[dataIndex],
          pedestriansRaw: d.pedestrians
        };
      }
    }
    // For hours without data, keep original (0)
    return {
      hour: d.hour,
      pedestrians: d.pedestrians,
      pedestriansRaw: d.pedestrians
    };
  });

  // For prediction, use the Kalman filter's prediction (which is based on actual data)
  // But also consider the trend: if we have recent data, use that trend
  let nextHourPrediction = predicted;

  // If we have recent data (last 2-3 hours), use trend-based prediction
  if (hoursWithData.length >= 3) {
    const recentHours = hoursWithData.slice(-3);
    const recentValues = recentHours.map(h => h.pedestrians);

    // Calculate simple trend (average of last 2 vs previous)
    if (recentValues.length >= 2) {
      const lastTwoAvg = (recentValues[recentValues.length - 1] + recentValues[recentValues.length - 2]) / 2;
      const previousAvg = recentValues.length >= 3
        ? (recentValues[recentValues.length - 2] + recentValues[recentValues.length - 3]) / 2
        : lastTwoAvg;

      const trend = lastTwoAvg - previousAvg;
      // Weighted combination: 70% Kalman prediction, 30% trend-adjusted
      nextHourPrediction = predicted * 0.7 + (lastTwoAvg + trend) * 0.3;
    }
  }

  // Ensure prediction is non-negative
  nextHourPrediction = Math.max(0, Math.round(nextHourPrediction));

  return {
    smoothed: smoothedData,
    nextHourPrediction
  };
}

/**
 * Apply Kalman filter to hourly walk-by scores
 * Returns smoothed scores and prediction for next hour
 * Only processes hours with actual data (non-zero scores) to avoid bias from missing hours
 */
export function smoothAndPredictScores(
  hourlyData: Array<{ hour: number; score: number }>
): { smoothed: Array<{ hour: number; score: number; scoreRaw: number }>; nextHourPrediction: number } {
  // Sort by hour
  const sortedData = hourlyData.sort((a, b) => a.hour - b.hour);

  // Separate hours with data from hours without data
  const hoursWithData = sortedData.filter(d => d.score > 0);
  const hoursWithoutData = sortedData.filter(d => d.score === 0);

  // If we have less than 2 hours with data, can't do meaningful prediction
  if (hoursWithData.length < 2) {
    const lastValue = hoursWithData.length > 0 ? hoursWithData[hoursWithData.length - 1].score : 0;
    return {
      smoothed: sortedData.map(d => ({
        hour: d.hour,
        score: d.score,
        scoreRaw: d.score
      })),
      nextHourPrediction: lastValue
    };
  }

  // Extract score series only from hours with data
  const scoreSeries = hoursWithData.map(d => d.score);

  // Apply Kalman filter only to hours with data
  const { smoothed, predicted } = kalmanFilter(scoreSeries);

  // Create smoothed data points - map back to all 24 hours
  const smoothedData = sortedData.map(d => {
    if (d.score > 0) {
      // Find index in hoursWithData array
      const dataIndex = hoursWithData.findIndex(h => h.hour === d.hour);
      if (dataIndex >= 0 && smoothed[dataIndex] !== undefined) {
        return {
          hour: d.hour,
          score: smoothed[dataIndex],
          scoreRaw: d.score
        };
      }
    }
    // For hours without data, keep original (0)
    return {
      hour: d.hour,
      score: d.score,
      scoreRaw: d.score
    };
  });

  // For prediction, use the Kalman filter's prediction (which is based on actual data)
  // But also consider the trend: if we have recent data, use that trend
  let nextHourPrediction = predicted;

  // If we have recent data (last 2-3 hours), use trend-based prediction
  if (hoursWithData.length >= 3) {
    const recentHours = hoursWithData.slice(-3);
    const recentValues = recentHours.map(h => h.score);

    // Calculate simple trend (average of last 2 vs previous)
    if (recentValues.length >= 2) {
      const lastTwoAvg = (recentValues[recentValues.length - 1] + recentValues[recentValues.length - 2]) / 2;
      const previousAvg = recentValues.length >= 3
        ? (recentValues[recentValues.length - 2] + recentValues[recentValues.length - 3]) / 2
        : lastTwoAvg;

      const trend = lastTwoAvg - previousAvg;
      // Weighted combination: 70% Kalman prediction, 30% trend-adjusted
      nextHourPrediction = predicted * 0.7 + (lastTwoAvg + trend) * 0.3;
    }
  }

  // Ensure prediction is non-negative
  nextHourPrediction = Math.max(0, nextHourPrediction);

  return {
    smoothed: smoothedData,
    nextHourPrediction
  };
}

