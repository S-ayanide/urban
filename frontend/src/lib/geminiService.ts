// Service to use Gemini AI for generating intelligent business recommendations
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BusinessMetrics, RealTrafficDataPoint } from './realDataService';

interface GeminiRecommendation {
  title: string;
  period: string;
  quantifiableMetrics: string[];
  recommendations: string[];
  reasoning: string;
}

// Initialize Gemini AI
function getGeminiClient() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.warn('Gemini API key not found. Using fallback recommendations.');
    return null;
  }
  
  return new GoogleGenerativeAI(apiKey);
}

// Generate recommendations using Gemini
export async function generateAIRecommendations(
  metrics: BusinessMetrics,
  businessName: string
): Promise<string[]> {
  const client = getGeminiClient();
  
  if (!client) {
    return generateFallbackRecommendations(metrics);
  }
  
  try {
    const model = client.getGenerativeModel({ model: 'gemini-pro' });
    
    // Prepare data summary for Gemini, including advanced algorithms
    const clustersSummary = metrics.clusters && metrics.clusters.length > 0
      ? metrics.clusters.map(c => {
          const hours = c.hours.map(formatHour).join(', ');
          return `Cluster "${c.label}" (id=${c.clusterId}): hours [${hours}], centroid score=${c.centroid[3].toFixed(2)}`;
        }).join('\n')
      : 'No clustering information available.';

    const predictionSummary = metrics.nextHourPrediction
      ? `Next-hour prediction: pedestrians=${metrics.nextHourPrediction.pedestrians}, score=${metrics.nextHourPrediction.score.toFixed(2)}.`
      : 'No Kalman prediction available.';
    
    const prompt = `You are a business analytics expert analyzing traffic flow data for a coffee shop/cafe.

Business: ${businessName}

Data Summary:
- Peak Hour: ${metrics.peakHour}:00 (Score: ${metrics.peakScore}, Footfall: ${metrics.peakFootfall} pedestrians)
- Activity Rate: ${metrics.activityRate}% of hours have high activity (audio > -50 dB)
- Busy Periods: ${metrics.busyPeriods.map(p => `${p.start}:00-${p.end}:00 (${p.reason})`).join(', ')}

Advanced Analytics:
- Temporal Clusters (from k-means clustering on hourly feature vectors):
${clustersSummary}
- Kalman Filter Prediction:
${predictionSummary}

Hourly Data (24 hours):
${metrics.hourlyData.map(hd => 
  `${hd.hour}:00 - Score: ${hd.score.toFixed(2)}, Pedestrians: ${hd.pedestrians}, Activity: ${hd.activity.toFixed(1)} dB, Traffic: ${hd.traffic}`
).join('\n')}

Analyze this data and provide quantifiable, data-driven recommendations:

1. **Peak Opportunity Analysis** (High Data Periods):
   - Identify exact peak hours with specific numbers (pedestrians, scores, activity levels)
   - Calculate expected customer conversion (assume 5-10% walk-by to walk-in)
   - Recommend staffing levels with specific numbers
   - Provide quantifiable action items

2. **Low-Traffic Period Analysis** (Low Data Periods):
   - Identify slow periods with specific hours and metrics
   - Calculate cost savings from reduced staffing
   - Recommend promotion strategies with expected impact
   - Suggest operational optimizations

3. **Actionable Recommendations (Including Predictions)**:
   - Use exact numbers from the data (e.g., "${metrics.peakFootfall} pedestrians at ${metrics.peakHour}:00")
   - Provide specific staffing recommendations (e.g., "Increase from 2 to 4 staff members")
   - Calculate expected outcomes (e.g., "Expect ${Math.round(metrics.peakFootfall * 0.08)} customers/hour")
   - Include time-specific actions with quantifiable metrics
   - If a high next-hour score is predicted, explicitly mention this (e.g., "Kalman filter predicts score ${metrics.nextHourPrediction ? metrics.nextHourPrediction.score.toFixed(2) : 'N/A'} in the next hour; recommend proactive actions before the rush starts.")

Format as clear, numbered recommendations with:
- Period identification with exact hours
- Quantifiable metrics from the data
- Specific action items with numbers
- Expected outcomes/impact

Be concise, practical, and always include specific numbers from the data provided.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse the response into structured recommendations
    return parseGeminiResponse(text, metrics);
    
  } catch (error) {
    console.error('Error generating Gemini recommendations:', error);
    return generateFallbackRecommendations(metrics);
  }
}

// Parse Gemini response into structured format
function parseGeminiResponse(text: string, metrics: BusinessMetrics): string[] {
  const recommendations: string[] = [];
  
  // Split text into lines and process
  const lines = text.split('\n').filter(line => line.trim());
  
  let currentSection = '';
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 3) return;
    
    // Detect section headers
    if (trimmed.match(/^(Peak|Low|High|Opportunity|Analysis|Recommendation|Period)/i) || 
        trimmed.match(/^#+\s+/) || 
        trimmed.match(/^\*\*/) ||
        trimmed.match(/^\d+\.\s+(Peak|Low|High|Opportunity)/i)) {
      currentSection = trimmed.replace(/^#+\s*|\*\*/g, '').trim();
      if (currentSection.length > 5) {
        recommendations.push(`${currentSection}`);
      }
    }
    // Detect numbered items or bullet points
    else if (trimmed.match(/^[-*•]\s+/) || trimmed.match(/^\d+[\.\)]\s+/)) {
      const content = trimmed.replace(/^[-*•\d\.\)]\s+/, '').trim();
      if (content.length > 10) {
        recommendations.push(`   • ${content}`);
      }
    }
    // Regular content lines with numbers (quantifiable)
    else if (/\d+/.test(trimmed) && trimmed.length > 15) {
      recommendations.push(`   • ${trimmed}`);
    }
    // Other meaningful content
    else if (trimmed.length > 20 && !trimmed.match(/^[A-Z\s]+$/)) {
      recommendations.push(`   • ${trimmed}`);
    }
  });
  
  // If we didn't get good parsing, use the text as-is with minimal formatting
  if (recommendations.length < 5) {
    const meaningfulLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 20 && (/\d+/.test(trimmed) || trimmed.match(/^(Peak|Low|High|Recommend|Staff|Increase|Reduce)/i));
    });
    
    meaningfulLines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.match(/^(Peak|Low|High|Opportunity|Analysis)/i)) {
        recommendations.push(`${trimmed}`);
      } else {
        recommendations.push(`   • ${trimmed}`);
      }
    });
  }
  
  // Always add data-driven summary at the end
  recommendations.push('');
  recommendations.push('Quantifiable Data Summary:');
  recommendations.push(`   • Peak Hour: ${formatHour(metrics.peakHour)} with ${metrics.peakFootfall} pedestrians, Score ${metrics.peakScore.toFixed(2)}`);
  recommendations.push(`   • Activity Rate: ${metrics.activityRate}% of hours above -50 dB threshold`);
  recommendations.push(`   • Busy Periods: ${metrics.busyPeriods.length} distinct periods identified`);
  recommendations.push(`   • Expected Peak Customers: ${Math.round(metrics.peakFootfall * 0.05)}-${Math.round(metrics.peakFootfall * 0.10)} per hour (5-10% conversion)`);
  if (metrics.nextHourPrediction) {
    recommendations.push(`   • Next-Hour Prediction: ${metrics.nextHourPrediction.pedestrians} pedestrians, Score ${metrics.nextHourPrediction.score.toFixed(2)} (from Kalman filter)`);
  }
  if (metrics.clusters && metrics.clusters.length > 0) {
    const busyCluster = metrics.clusters.find(c => c.label === 'busy') || metrics.clusters[metrics.clusters.length - 1];
    recommendations.push(`   • Clustered Hour Types: ${metrics.clusters.length} clusters identified (e.g., busiest cluster hours: ${busyCluster.hours.map(formatHour).join(', ')})`);
  }
  
  return recommendations.slice(0, 40); // Limit to 40 recommendations
}

// Fallback recommendations if Gemini is not available
function generateFallbackRecommendations(metrics: BusinessMetrics): string[] {
  const recommendations: string[] = [];
  
  // Peak opportunity
    recommendations.push(`Peak Opportunity Analysis (${formatHour(metrics.peakHour)}-${formatHour(metrics.peakHour + 1)})`);
  recommendations.push(`   • Quantifiable Metrics: ${metrics.peakFootfall} pedestrians, Score ${metrics.peakScore.toFixed(2)}, Activity ${metrics.hourlyData[metrics.peakHour].activity.toFixed(1)} dB`);
  recommendations.push(`   • Increase staffing by 50% starting at ${formatHour(Math.max(0, metrics.peakHour - 1))}:30`);
  recommendations.push(`   • Deploy 3-5 outdoor displays at ${formatHour(Math.max(0, metrics.peakHour - 1))}:00`);
  recommendations.push(`   • Expected walk-by: ${metrics.peakFootfall} pedestrians/hour`);
  recommendations.push(`   • Target conversion: ${Math.round(metrics.peakFootfall * 0.05)}-${Math.round(metrics.peakFootfall * 0.10)} customers`);
  
  // Busy periods
  metrics.busyPeriods.forEach(period => {
    const periodData = metrics.hourlyData.filter(d => d.hour >= period.start && d.hour <= period.end);
    const avgPedestrians = Math.round(periodData.reduce((sum, d) => sum + d.pedestrians, 0) / periodData.length);
    const avgScore = (periodData.reduce((sum, d) => sum + d.score, 0) / periodData.length).toFixed(2);
    const avgActivity = (periodData.reduce((sum, d) => sum + d.activity, 0) / periodData.length).toFixed(1);
    
    recommendations.push(`Extended Busy Period (${formatHour(period.start)}-${formatHour(period.end)})`);
    recommendations.push(`   • Reason: ${period.reason}`);
    recommendations.push(`   • Quantifiable: ${avgPedestrians} avg pedestrians/hour, Score ${avgScore}, Activity ${avgActivity} dB`);
    recommendations.push(`   • Maintain full staffing (${period.end - period.start + 1} hours)`);
    recommendations.push(`   • Expected total footfall: ${periodData.reduce((sum, d) => sum + d.pedestrians, 0)} pedestrians`);
  });
  
  // Low traffic periods
  const lowTrafficHours = metrics.hourlyData.filter(d => d.score < 2 && d.pedestrians < 50);
  if (lowTrafficHours.length > 0) {
    const lowStart = lowTrafficHours[0].hour;
    const lowEnd = lowTrafficHours[lowTrafficHours.length - 1].hour;
    const avgLowPedestrians = Math.round(lowTrafficHours.reduce((sum, d) => sum + d.pedestrians, 0) / lowTrafficHours.length);
    
    recommendations.push(`Low-Traffic Period (${formatHour(lowStart)}-${formatHour(lowEnd)})`);
    recommendations.push(`   • Quantifiable: Only ${avgLowPedestrians} avg pedestrians/hour, Score < 2.0`);
    recommendations.push(`   • Reduce staffing by 60% (${lowTrafficHours.length} hours)`);
    recommendations.push(`   • Run promotions: "Happy Hour" discounts 20-30%`);
    recommendations.push(`   • Focus on ${Math.round(lowTrafficHours.length * 0.5)} hours of prep/cleaning`);
  }
  
  // Activity-based insights
  const highActivityHours = metrics.hourlyData.filter(d => d.activity > -50);
  if (highActivityHours.length > 0) {
    const avgActivity = (highActivityHours.reduce((sum, d) => sum + d.activity, 0) / highActivityHours.length).toFixed(1);
    recommendations.push(`High Activity Periods (${highActivityHours.length} hours)`);
    recommendations.push(`   • Quantifiable: ${avgActivity} dB average (above -50 dB threshold)`);
    recommendations.push(`   • ${highActivityHours.length} hours require maximum staff visibility`);
    recommendations.push(`   • Audio levels indicate busy environment - ensure ${Math.round(highActivityHours.length * 0.8)} hours of peak service`);
  }
  
  return recommendations;
}

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`;
}

