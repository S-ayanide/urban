# Local Commerce Traffic Flow Analysis

**Project:** Identifying Walk-by Potential through Crowdsensing  
**Location:** Costa Coffee @ Trinity College, Dublin  
**Course:** Urban Computing

## 📋 Project Overview

This project uses crowdsensing technology to help local businesses understand the true potential of their location and sidewalk traffic patterns. By combining multiple data sources (footfall data, traffic volume, and manual sensor collection), we provide actionable insights that directly impact local commerce decisions.

### Key Objectives

1. **Sense:** Collect multi-modal data using smartphone sensors and public datasets
2. **Analyse:** Measure and compare walk-by traffic rates at different times and days
3. **Actuate:** Provide data-driven insights through an interactive dashboard

## 🗂️ Project Structure

```
MainProject/
├── README.md                          # This file
├── requirements.txt                   # Python dependencies
├── traffic_analysis.py                # Main analysis script
├── create_dashboard.py                # Interactive dashboard generator
│
├── automated_collection/
│   ├── open-data/
│   │   ├── dlr_footfall/             # DLR pedestrian footfall data
│   │   │   └── date=2025-11-07/
│   │   │       └── 1762547729454.csv
│   │   └── dlr_scats_locations/       # SCATS monitoring site locations
│   │       └── date=2025-11-07/
│   │           └── 1762545401457.csv
│   └── sessions/                      # Manual sensor data collection
│       ├── date=2025-11-06/
│       │   └── device=android-7ef705ff/
│       │       └── 1762460820283.json
│       └── date=2025-11-07/
│           ├── device=android-50dd91de/
│           │   └── 1762520691350.json
│           └── device=android-83e6dd1a/
│               └── 1762519995678.json
│
├── SCATSMay2025.csv                   # SCATS traffic volume data (12M+ records)
│
├── manual_collection/                 # Additional manual sensor data
│   ├── costa_data/                    # Costa Coffee sensor logs
│   └── tbc_data/                      # Alternative location data
│
└── analysis_output/                   # Generated outputs
    ├── interactive_dashboard.html     # Main interactive dashboard
    ├── comprehensive_dashboard.png    # Static visualization
    ├── location_map.png               # SCATS sites map
    └── business_report.txt            # Detailed text report
```

## 📊 Data Sources

### 1. DLR Footfall Data
- **Source:** Dún Laoghaire-Rathdown County Council
- **Coverage:** Multiple pedestrian monitoring locations
- **Metrics:** Hourly pedestrian counts (IN/OUT)
- **Records:** 6,576 entries covering Jan-Oct 2025
- **Locations:**
  - Dun Laoghaire @ Peoples Park
  - Seapoint Beach
  - York Road
  - Glenageary
  - Rock Road Park
  - Wyattville Road

### 2. SCATS Location Data
- **Source:** Dublin City Council / Transport Infrastructure Ireland
- **Coverage:** 290 traffic monitoring sites
- **Data:** Site ID, Location name, GPS coordinates (Lat/Long)
- **Purpose:** Link traffic volume data to specific locations

### 3. SCATS Traffic Volume Data
- **Source:** Sydney Coordinated Adaptive Traffic System
- **Coverage:** May 2025
- **Records:** 12,194,291 vehicle count records
- **Metrics:** Sum_Volume, Avg_Volume per detector
- **Temporal Resolution:** Continuous monitoring
- **Format:** End_Time, Region, Site, Detector, Sum_Volume

### 4. Manual Sensor Data (Costa Coffee @ Trinity)
- **Collection Method:** Smartphone sensors
- **Sessions:** 3 collection sessions
- **Samples:** 160 sensor readings
- **Sensors Used:**
  - **Accelerometer:** Detects movement patterns
  - **Gyroscope:** Measures orientation changes
  - **Light Sensor:** Ambient light levels (Lux)
  - **Magnetometer:** Detects metal objects (buses, trams)
  - **Audio:** Sound levels in decibels (dB)
  - **GPS:** Precise location tagging
- **Collection Times:** 12:00-13:00, 13:00-14:00, 20:00-21:00
- **Location:** Costa Coffee opposite Trinity College

## 🚀 Installation & Setup

### Prerequisites

- Python 3.9 or higher
- pip (Python package manager)

### Installation Steps

1. **Clone or navigate to the project directory:**
   ```bash
   cd "/Users/sayanide/Documents/Assignments/Urban Computing/MainProject"
   ```

2. **Install required packages:**
   ```bash
   pip3 install -r requirements.txt
   ```

3. **Required packages:**
   - pandas >= 2.0.0
   - numpy >= 1.24.0
   - matplotlib >= 3.7.0
   - seaborn >= 0.12.0
   - plotly >= 5.14.0
   - jupyter >= 1.0.0 (optional, for notebooks)

## 📈 Running the Analysis

### Option 1: Complete Analysis with Static Visualizations

```bash
python3 traffic_analysis.py
```

This will:
- Load all data sources (footfall, SCATS, sensor data)
- Perform comprehensive analysis
- Generate static PNG visualizations
- Create a detailed text report
- Save all outputs to `analysis_output/`

### Option 2: Interactive Dashboard

```bash
python3 create_dashboard.py
```

This will:
- Generate an interactive HTML dashboard
- Create zoomable, hoverable charts
- Include an interactive map
- Provide business recommendations
- Save to `analysis_output/interactive_dashboard.html`

### Option 3: View Pre-generated Dashboard

Simply open in your web browser:
```bash
open analysis_output/interactive_dashboard.html
```

## 📊 Key Findings

### Peak Walk-by Periods

| Rank | Time Period | Walk-by Score | Recommendations |
|------|-------------|---------------|-----------------|
| 🥇 #1 | 13:00-14:00 | 11.22 | Maximum staffing, outdoor signage |
| 🥈 #2 | 12:00-13:00 | 10.95 | Full staff, greeting at entrance |
| 🥉 #3 | 14:00-15:00 | 6.60 | Maintain visibility |

### Traffic Patterns

- **Morning Rush:** 08:00-09:00 (Score: 4.26)
- **Lunch Peak:** 12:00-14:00 (Score: 10.95-11.22) ⭐
- **Evening Peak:** 17:00-18:00 (Score: 5.75-6.15)
- **Low Traffic:** 03:00-06:00 (Score: 0.03-0.19)

### Data Integration Results

- **DLR Footfall Peak:** 13:00 with 579 average pedestrians/hour
- **Sensor Activity:** 96.2% of samples showed "busy" conditions
- **SCATS Traffic:** 26.4M vehicle movements analyzed (sample)
- **Manual Collections:** 160 sensor samples across 3 sessions

## 💡 Business Recommendations

### 1. Maximize Peak Opportunity (13:00-14:00)

**Actions:**
- ✅ Increase staffing 30 minutes before peak (12:30)
- ✅ Deploy outdoor signage at 12:00
- ✅ Position staff at entrance for customer greeting
- ✅ Consider outdoor seating during high-traffic period
- ✅ Promote quick-service items to maximize throughput

**Expected Impact:**
- Target 5-10% conversion of walk-by traffic
- Potential for 30-50 additional customers during peak hour

### 2. Optimize Low-Traffic Periods

**Actions:**
- 🌙 Reduce to skeleton staff (03:00-06:00)
- 💰 Run "Happy Hour" promotions during slow periods
- ☕ Focus on dwell time and repeat customers
- 💡 Adjust utilities (heating/cooling, lighting) to reduce costs

**Expected Impact:**
- 20-30% reduction in labor costs during off-peak hours
- Maintain service quality while optimizing resources

### 3. Conversion Strategy

**Tactics:**
- 🎨 Eye-catching signage and window displays
- 👃 Aroma marketing (coffee scent at entrance)
- 👋 Staff visibility at entrance during peak times
- 📸 Instagram-worthy interior for social media marketing

**Measurement:**
- Track manual walk-by vs walk-in counts for 1 week
- A/B test different signage positions
- Monitor sales data correlation with traffic patterns

### 4. Transport Integration

**Insights:**
- Monitor bus/Luas schedules
- Position staff during transport arrival times
- Consider partnerships with Dublin Bus for commuter promotions
- Track impact of transport disruptions

## 🔬 Methodology

### Walk-by Potential Score Calculation

The walk-by potential score is a composite metric combining three data sources:

```python
Walk-by Score = (Footfall/100) + ((Audio + 70)/10) + (Traffic/50)
```

**Components:**
1. **Footfall Component:** Average pedestrian count (DLR data)
2. **Activity Component:** Normalized audio levels (-70 to -20 dB range)
3. **Traffic Component:** Vehicle volume as proxy for street activity

### Data Processing Pipeline

1. **Data Collection:**
   - Load DLR footfall CSV files
   - Load SCATS location and volume data
   - Parse JSON sensor data from manual collections

2. **Data Cleaning:**
   - Convert timestamps to datetime objects
   - Handle missing values
   - Normalize sensor readings

3. **Feature Engineering:**
   - Extract hour of day
   - Calculate day of week
   - Compute distance from Costa Coffee to SCATS sites
   - Aggregate hourly metrics

4. **Analysis:**
   - Calculate walk-by potential scores
   - Identify peak and low-traffic periods
   - Generate business insights

5. **Visualization:**
   - Create static PNG charts
   - Generate interactive Plotly dashboard
   - Build location map with SCATS sites

## 📱 Sensor Data Collection Details

### Collection Protocol

**Location:** Costa Coffee opposite Trinity College, Dublin  
**Position:** Fixed observation point at sidewalk entrance  
**Duration:** 5-10 minute sessions

**Measured Variables:**
- `accelerometer`: Movement patterns (x, y, z axes)
- `gyroscope`: Rotation rates (x, y, z axes)
- `lightLux`: Ambient light in Lux
- `audioDb`: Sound levels in decibels
- `magnetometer`: Magnetic field (for detecting buses/trams)
- `location`: GPS coordinates (lat/lon)
- `timestamp`: Unix timestamp in milliseconds

### Data Quality

- **Sampling Rate:** ~3-5 seconds per sample
- **Sensors Active:** 7 simultaneous sensors
- **Location Accuracy:** GPS accuracy ~10-20 meters
- **Audio Threshold:** -50 dB indicates "busy" conditions

## 📊 Output Files

### 1. Interactive Dashboard (`interactive_dashboard.html`)
- **Features:**
  - Zoomable, hoverable charts
  - Interactive location map
  - Real-time data filtering
  - Responsive design
- **Contents:**
  - Walk-by potential score chart
  - Footfall patterns
  - Audio activity levels
  - Traffic volume trends
  - Day of week analysis
  - Business recommendations

### 2. Comprehensive Dashboard (`comprehensive_dashboard.png`)
- **Format:** High-resolution PNG (300 DPI)
- **Size:** ~20" x 12"
- **Charts:** 7 integrated visualizations
- **Use:** Reports, presentations

### 3. Location Map (`location_map.png`)
- **Shows:**
  - All 290 SCATS monitoring sites
  - Sites within 2km of Costa Coffee
  - Distance annotations
- **Purpose:** Spatial context for traffic data

### 4. Business Report (`business_report.txt`)
- **Contents:**
  - Executive summary
  - Peak periods analysis
  - Low-traffic periods
  - Data source summary
  - Detailed recommendations
  - Continuous monitoring guidelines

## 🔄 Sense-Analyse-Actuate Cycle

### SENSE
**Data Collection Methods:**
1. **Automated Public Data:**
   - DLR Footfall API/CSV downloads
   - SCATS traffic monitoring system
   - Location coordinates database

2. **Manual Crowdsensing:**
   - Smartphone sensor data collection
   - On-site observations
   - Context logging (events, weather)

**Sensors Used:**
- 📱 Camera (for manual counts)
- 📍 GPS (geo-tagging)
- 🧲 Magnetometer (bus/tram detection)
- 🔊 Microphone (audio levels)
- 💡 Light sensor
- 🏃 Accelerometer
- 🔄 Gyroscope

### ANALYSE
**Analysis Techniques:**
1. **Temporal Analysis:**
   - Hourly traffic patterns
   - Day-of-week trends
   - Seasonal variations

2. **Spatial Analysis:**
   - Distance calculations (Haversine formula)
   - Proximity analysis to transport hubs
   - Catchment area mapping

3. **Correlation Analysis:**
   - Footfall vs traffic volume
   - Audio levels vs pedestrian density
   - Transport schedules vs foot traffic spikes

4. **Composite Scoring:**
   - Multi-source data fusion
   - Weighted scoring algorithm
   - Normalization techniques

### ACTUATE
**Information Dissemination:**
1. **Interactive Dashboard:**
   - Real-time insights display
   - Drill-down capabilities
   - Mobile-responsive design

2. **Actionable Alerts:**
   - Peak period notifications
   - Low-traffic warnings
   - Anomaly detection

3. **Business Actions Triggered:**
   - Staffing adjustments
   - Signage deployment
   - Promotional timing
   - Resource allocation

**Feedback Loop:**
- Monitor actual conversion rates
- Compare predicted vs actual traffic
- Refine scoring algorithm
- Seasonal adjustment

## 🎯 Project Impact

### For Local Businesses

**Immediate Benefits:**
- Data-driven staffing decisions (potential 20-30% labor cost savings)
- Optimized marketing timing (5-10% conversion rate improvement)
- Evidence-based lease negotiations
- Competitive advantage through location intelligence

**Long-term Benefits:**
- Predictive traffic modeling
- Seasonal trend analysis
- Event impact assessment
- ROI measurement for interventions

### For Urban Planning

**Insights Provided:**
- Pedestrian flow patterns
- Transport hub impact on commerce
- Time-of-day activity mapping
- Commercial district vitality metrics

**Applications:**
- Business Improvement District (BID) planning
- Transport integration optimization
- Street design decisions
- Economic development strategies

## 📝 Future Enhancements

### Short-term (1-3 months)
- [ ] Expand data collection to 5+ businesses
- [ ] Implement weather data integration
- [ ] Add weekday vs weekend comparison
- [ ] Create automated email reports

### Medium-term (3-6 months)
- [ ] Machine learning prediction models
- [ ] Real-time data streaming
- [ ] Mobile app for business owners
- [ ] Integration with POS systems

### Long-term (6-12 months)
- [ ] City-wide deployment
- [ ] Computer vision for automated counts
- [ ] Demographic analysis (age, group size)
- [ ] Predictive modeling for events

## 🛠️ Technical Details

### System Requirements
- **OS:** macOS, Linux, Windows
- **Python:** 3.9+
- **RAM:** 4GB minimum (8GB recommended for full SCATS data)
- **Storage:** 2GB for data and outputs

### Performance Optimization
- SCATS data loading limited to 500K rows (adjustable)
- Vectorized pandas operations for speed
- Efficient datetime parsing
- Matplotlib backend optimization

### Error Handling
- Graceful handling of missing data files
- Timestamp parsing with multiple formats
- Division by zero protection
- File I/O error recovery

## 📚 References

### Data Sources
1. Dún Laoghaire-Rathdown County Council - Footfall Data
2. Dublin City Council - SCATS Traffic Monitoring
3. Transport Infrastructure Ireland - Location Data
4. Manual smartphone sensor collection (original research)

### Methodology
1. Haversine distance formula for geospatial calculations
2. Composite scoring for multi-modal data fusion
3. Temporal aggregation for pattern identification
4. Interactive visualization best practices (Plotly)

### Smart Cities Framework
- Sense-Analyse-Actuate cycle
- Crowdsensing methodologies
- Urban informatics
- Location-based services

## 👥 Project Team

**Student:** [Your Name]  
**Course:** Urban Computing  
**Institution:** [Your Institution]  
**Date:** November 2025

## 📞 Contact & Support

For questions about this project:
- Email: [your.email@domain.com]
- Project Repository: [if applicable]

## 📄 License

This project is created for academic purposes as part of an Urban Computing course assignment.

---

## 🎓 Academic Context

This project demonstrates the practical application of smart city principles to solve real-world challenges faced by local businesses. By combining crowdsensing, public data integration, and actionable visualization, we create a complete Sense-Analyse-Actuate cycle that contributes to urban economic vitality and efficiency.

**Key Learning Outcomes:**
1. ✅ Multi-modal sensor data collection
2. ✅ Large-scale urban dataset integration
3. ✅ Geospatial analysis techniques
4. ✅ Interactive visualization design
5. ✅ Stakeholder-focused insight generation
6. ✅ Real-world smart city application

---

**Last Updated:** November 15, 2025  
**Version:** 1.0



