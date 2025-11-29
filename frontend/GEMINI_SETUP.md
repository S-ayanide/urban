# Gemini AI Setup for Intelligent Recommendations

The dashboard uses Google's Gemini AI to generate intelligent, quantifiable business recommendations based on your traffic flow data.

## Setup

1. **Get a Gemini API Key**:
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Sign in with your Google account
   - Create a new API key

2. **Add to .env file**:
   Create or edit `ui/.env` file:
   ```
   VITE_GEMINI_API_KEY=your_api_key_here
   ```

3. **Restart the dev server**:
   ```bash
   npm run dev
   ```

## How It Works

When you select "Costa Coffee" or "Two Boys Cafe", the dashboard:
1. Loads your real sensor data (audio, footfall, light, etc.)
2. Calculates quantifiable metrics
3. Sends the data to Gemini AI for analysis
4. Receives intelligent recommendations with:
   - **Quantifiable metrics**: Exact numbers (pedestrians, scores, activity levels)
   - **Specific recommendations**: "Increase staffing by X%", "Expect Y customers/hour"
   - **Data-driven insights**: Based on actual patterns in your data
   - **Period analysis**: Identifies high and low data periods with reasons

## Features

- **Peak Opportunity Analysis**: Identifies exact peak hours with quantifiable metrics
- **Low-Traffic Period Analysis**: Identifies slow periods with specific recommendations
- **Actionable Recommendations**: Provides specific, numbered recommendations
- **Expected Outcomes**: Calculates expected customer conversion and impact

## Fallback

If the Gemini API key is not set, the dashboard will use intelligent fallback recommendations based on the data patterns, but they won't be as detailed or quantifiable.

## Privacy

Your data is sent to Google's Gemini API for analysis. Make sure you're comfortable with this before using the feature.

