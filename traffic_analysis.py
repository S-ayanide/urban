#!/usr/bin/env python3
"""
Local Commerce Traffic Flow Analysis
This script analyzes crowdsensing data to help local businesses understand
their walk-by potential and sidewalk traffic patterns.
"""

import pandas as pd
import numpy as np
import json
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
import os
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

# Set style for visualizations
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (14, 8)
plt.rcParams['font.size'] = 10

class TrafficAnalyzer:
    """Main class for analyzing traffic and footfall data"""
    
    def __init__(self, base_path):
        self.base_path = Path(base_path)
        self.footfall_data = None
        self.scats_locations = None
        self.scats_volume_data = None
        self.session_data = None
        self.costa_location = {"lat": 53.3441, "lon": -6.2572}  # Trinity College area
        
    def load_footfall_data(self):
        """Load DLR footfall data"""
        print("Loading footfall data...")
        footfall_files = list((self.base_path / "automated_collection/open-data/dlr_footfall").rglob("*.csv"))
        
        if footfall_files:
            self.footfall_data = pd.read_csv(footfall_files[0])
            self.footfall_data['Time'] = pd.to_datetime(self.footfall_data['Time'])
            print(f"✓ Loaded footfall data: {len(self.footfall_data)} records")
            return True
        return False
    
    def load_scats_locations(self):
        """Load SCATS location data"""
        print("Loading SCATS location data...")
        location_files = list((self.base_path / "automated_collection/open-data/dlr_scats_locations").rglob("*.csv"))
        
        if location_files:
            self.scats_locations = pd.read_csv(location_files[0])
            print(f"✓ Loaded SCATS locations: {len(self.scats_locations)} sites")
            return True
        return False
    
    def load_scats_volume_data_sample(self, nrows=100000):
        """Load a sample of SCATS volume data (file is very large)"""
        print(f"Loading SCATS volume data sample ({nrows} rows)...")
        try:
            scats_file = self.base_path / "SCATSMay2025.csv"
            if scats_file.exists():
                self.scats_volume_data = pd.read_csv(scats_file, nrows=nrows)
                self.scats_volume_data['End_Time'] = pd.to_datetime(self.scats_volume_data['End_Time'], format='%Y%m%d%H%M%S')
                print(f"✓ Loaded SCATS volume data: {len(self.scats_volume_data)} records")
                return True
        except Exception as e:
            print(f"⚠ Warning: Could not load SCATS volume data: {e}")
        return False
    
    def load_session_data(self):
        """Load manual sensor collection data from Costa Coffee"""
        print("Loading manual session data...")
        session_files = list((self.base_path / "automated_collection/sessions").rglob("*.json"))
        
        all_sessions = []
        for session_file in session_files:
            with open(session_file, 'r') as f:
                session = json.load(f)
                samples = json.loads(session['samples'])
                
                # Process each sample
                for sample in samples:
                    sample['deviceId'] = session['deviceId']
                    sample['sessionId'] = session['sessionId']
                    sample['date'] = session['date']
                    sample['datetime'] = pd.to_datetime(sample['ts'], unit='ms')
                    all_sessions.append(sample)
        
        if all_sessions:
            self.session_data = pd.DataFrame(all_sessions)
            print(f"✓ Loaded session data: {len(self.session_data)} samples from {len(session_files)} sessions")
            return True
        return False
    
    def calculate_distance(self, lat1, lon1, lat2, lon2):
        """Calculate distance between two coordinates in km using Haversine formula"""
        from math import radians, sin, cos, sqrt, atan2
        
        R = 6371  # Earth's radius in km
        
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        distance = R * c
        
        return distance
    
    def find_nearby_scats_sites(self, target_lat, target_lon, radius_km=2.0):
        """Find SCATS sites within radius of target location"""
        if self.scats_locations is None:
            return None
        
        distances = []
        for idx, row in self.scats_locations.iterrows():
            dist = self.calculate_distance(target_lat, target_lon, row['Lat'], row['Long'])
            distances.append(dist)
        
        self.scats_locations['distance_km'] = distances
        nearby_sites = self.scats_locations[self.scats_locations['distance_km'] <= radius_km].copy()
        nearby_sites = nearby_sites.sort_values('distance_km')
        
        return nearby_sites
    
    def analyze_session_patterns(self):
        """Analyze patterns from manual sensor data"""
        if self.session_data is None:
            return None
        
        print("\n" + "="*80)
        print("MANUAL SENSOR DATA ANALYSIS - Costa Coffee @ Trinity")
        print("="*80)
        
        # Extract audio levels
        self.session_data['hour'] = self.session_data['datetime'].dt.hour
        self.session_data['minute'] = self.session_data['datetime'].dt.minute
        
        # Group by time periods
        hourly_stats = self.session_data.groupby('hour').agg({
            'audioDb': ['mean', 'std', 'min', 'max'],
            'lightLux': ['mean', 'std'],
            'ts': 'count'
        }).round(2)
        
        print("\nHourly Activity Patterns:")
        print(hourly_stats)
        
        # Analyze activity levels based on audio
        audio_threshold = -50  # dB threshold for "busy" periods
        self.session_data['is_busy'] = self.session_data['audioDb'] > audio_threshold
        
        busy_percentage = (self.session_data['is_busy'].sum() / len(self.session_data)) * 100
        print(f"\nBusy Period Detection (audio > {audio_threshold} dB):")
        print(f"  Busy samples: {busy_percentage:.1f}%")
        
        return hourly_stats
    
    def analyze_footfall_patterns(self):
        """Analyze DLR footfall patterns"""
        if self.footfall_data is None:
            return None
        
        print("\n" + "="*80)
        print("DLR FOOTFALL DATA ANALYSIS")
        print("="*80)
        
        # Add time features
        self.footfall_data['hour'] = self.footfall_data['Time'].dt.hour
        self.footfall_data['day_of_week'] = self.footfall_data['Time'].dt.dayofweek
        self.footfall_data['date'] = self.footfall_data['Time'].dt.date
        
        # Calculate total pedestrian counts across all locations
        pedestrian_columns = [col for col in self.footfall_data.columns if 'Pedestrian' in col and 'OUT' not in col and 'IN' not in col]
        
        if pedestrian_columns:
            self.footfall_data['total_pedestrians'] = self.footfall_data[pedestrian_columns].sum(axis=1)
            
            # Hourly averages
            hourly_avg = self.footfall_data.groupby('hour')['total_pedestrians'].mean()
            
            print("\nAverage Hourly Pedestrian Traffic:")
            for hour, count in hourly_avg.items():
                print(f"  {hour:02d}:00 - {count:.0f} pedestrians")
            
            # Peak hours
            peak_hour = hourly_avg.idxmax()
            peak_count = hourly_avg.max()
            print(f"\n📊 Peak Hour: {peak_hour}:00 with {peak_count:.0f} pedestrians")
            
            return hourly_avg
        
        return None
    
    def analyze_traffic_volume_near_costa(self):
        """Analyze traffic volume from SCATS data near Costa Coffee location"""
        if self.scats_volume_data is None or self.scats_locations is None:
            return None
        
        print("\n" + "="*80)
        print("TRAFFIC VOLUME ANALYSIS - Near Costa Coffee @ Trinity")
        print("="*80)
        
        # Find nearby SCATS sites
        nearby_sites = self.find_nearby_scats_sites(
            self.costa_location['lat'], 
            self.costa_location['lon'], 
            radius_km=1.5
        )
        
        if nearby_sites is not None and len(nearby_sites) > 0:
            print(f"\nFound {len(nearby_sites)} SCATS sites within 1.5km:")
            for idx, site in nearby_sites.head(5).iterrows():
                print(f"  Site {site['Site_ID']}: {site['Location']} ({site['distance_km']:.2f} km)")
            
            # Filter traffic data for nearby sites
            nearby_site_ids = nearby_sites['Site_ID'].tolist()
            nearby_traffic = self.scats_volume_data[self.scats_volume_data['Site'].isin(nearby_site_ids)]
            
            if len(nearby_traffic) > 0:
                # Calculate hourly traffic patterns
                nearby_traffic['hour'] = nearby_traffic['End_Time'].dt.hour
                hourly_volume = nearby_traffic.groupby('hour')['Sum_Volume'].sum()
                
                print("\nHourly Traffic Volume (nearby sites):")
                for hour, volume in hourly_volume.items():
                    print(f"  {hour:02d}:00 - {volume} vehicles")
                
                return nearby_traffic, nearby_sites
        
        return None, None
    
    def calculate_walkby_potential(self):
        """Calculate walk-by potential based on all data sources"""
        print("\n" + "="*80)
        print("WALK-BY POTENTIAL CALCULATION")
        print("="*80)
        
        # Create hourly analysis
        hours = range(24)
        walkby_scores = []
        
        for hour in hours:
            score = 0
            factors = []
            
            # Factor 1: Footfall data
            if self.footfall_data is not None:
                footfall_hour = self.footfall_data[self.footfall_data['hour'] == hour]
                if len(footfall_hour) > 0:
                    pedestrian_cols = [col for col in footfall_hour.columns if 'Pedestrian' in col and 'OUT' not in col and 'IN' not in col]
                    if pedestrian_cols:
                        avg_pedestrians = footfall_hour[pedestrian_cols].sum(axis=1).mean()
                        score += avg_pedestrians / 100  # Normalize
                        factors.append(f"footfall: {avg_pedestrians:.0f}")
            
            # Factor 2: Session activity data
            if self.session_data is not None:
                session_hour = self.session_data[self.session_data['hour'] == hour]
                if len(session_hour) > 0:
                    avg_audio = session_hour['audioDb'].mean()
                    # Higher audio = more activity
                    audio_score = (avg_audio + 70) / 10  # Normalize (-70 to -20 dB range)
                    score += max(0, audio_score)
                    factors.append(f"activity: {avg_audio:.1f} dB")
            
            # Factor 3: Traffic volume (proxy for street activity)
            if self.scats_volume_data is not None:
                traffic_hour = self.scats_volume_data[self.scats_volume_data['End_Time'].dt.hour == hour]
                if len(traffic_hour) > 0:
                    avg_volume = traffic_hour['Sum_Volume'].mean()
                    score += avg_volume / 50  # Normalize
                    factors.append(f"traffic: {avg_volume:.0f}")
            
            walkby_scores.append({
                'hour': hour,
                'score': score,
                'factors': ', '.join(factors)
            })
        
        walkby_df = pd.DataFrame(walkby_scores)
        
        print("\nWalk-by Potential Score by Hour:")
        for idx, row in walkby_df.iterrows():
            bar = "█" * int(row['score'])
            print(f"  {row['hour']:02d}:00 [{row['score']:6.2f}] {bar}")
        
        # Identify peak periods
        peak_hours = walkby_df.nlargest(3, 'score')
        print("\n🎯 TOP 3 PEAK WALK-BY PERIODS:")
        for idx, row in peak_hours.iterrows():
            print(f"  #{idx+1}: {row['hour']:02d}:00 - Score: {row['score']:.2f}")
        
        return walkby_df
    
    def visualize_comprehensive_analysis(self, walkby_df):
        """Create comprehensive visualizations"""
        print("\n" + "="*80)
        print("GENERATING VISUALIZATIONS")
        print("="*80)
        
        output_dir = self.base_path / "analysis_output"
        output_dir.mkdir(exist_ok=True)
        
        # Create a comprehensive dashboard
        fig = plt.figure(figsize=(20, 12))
        gs = fig.add_gridspec(3, 3, hspace=0.3, wspace=0.3)
        
        # 1. Walk-by Potential Score
        ax1 = fig.add_subplot(gs[0, :])
        ax1.bar(walkby_df['hour'], walkby_df['score'], color='steelblue', alpha=0.7, edgecolor='navy')
        ax1.set_xlabel('Hour of Day', fontsize=12, fontweight='bold')
        ax1.set_ylabel('Walk-by Potential Score', fontsize=12, fontweight='bold')
        ax1.set_title('Walk-by Potential Score Throughout the Day', fontsize=14, fontweight='bold')
        ax1.grid(axis='y', alpha=0.3)
        ax1.set_xticks(range(0, 24, 2))
        
        # Add peak hour annotations
        peak_hours = walkby_df.nlargest(3, 'score')
        for idx, row in peak_hours.iterrows():
            ax1.annotate(f"Peak\n{row['score']:.1f}", 
                        xy=(row['hour'], row['score']),
                        xytext=(row['hour'], row['score'] + 2),
                        ha='center', fontsize=9, color='darkred', fontweight='bold',
                        bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.7))
        
        # 2. Footfall Patterns
        if self.footfall_data is not None:
            ax2 = fig.add_subplot(gs[1, 0])
            hourly_footfall = self.footfall_data.groupby('hour')['total_pedestrians'].mean()
            ax2.plot(hourly_footfall.index, hourly_footfall.values, marker='o', linewidth=2, color='green')
            ax2.fill_between(hourly_footfall.index, hourly_footfall.values, alpha=0.3, color='green')
            ax2.set_xlabel('Hour of Day', fontsize=10, fontweight='bold')
            ax2.set_ylabel('Avg Pedestrians', fontsize=10, fontweight='bold')
            ax2.set_title('DLR Footfall Data - Hourly Average', fontsize=11, fontweight='bold')
            ax2.grid(alpha=0.3)
        
        # 3. Session Activity (Audio levels)
        if self.session_data is not None:
            ax3 = fig.add_subplot(gs[1, 1])
            hourly_audio = self.session_data.groupby('hour')['audioDb'].mean()
            ax3.bar(hourly_audio.index, hourly_audio.values, color='coral', alpha=0.7, edgecolor='darkred')
            ax3.set_xlabel('Hour of Day', fontsize=10, fontweight='bold')
            ax3.set_ylabel('Audio Level (dB)', fontsize=10, fontweight='bold')
            ax3.set_title('Costa Coffee Activity - Audio Levels', fontsize=11, fontweight='bold')
            ax3.axhline(y=-50, color='red', linestyle='--', linewidth=2, label='Busy Threshold')
            ax3.legend()
            ax3.grid(alpha=0.3)
        
        # 4. Traffic Volume
        if self.scats_volume_data is not None:
            ax4 = fig.add_subplot(gs[1, 2])
            self.scats_volume_data['hour'] = self.scats_volume_data['End_Time'].dt.hour
            hourly_traffic = self.scats_volume_data.groupby('hour')['Sum_Volume'].sum()
            ax4.plot(hourly_traffic.index, hourly_traffic.values, marker='s', linewidth=2, color='purple')
            ax4.fill_between(hourly_traffic.index, hourly_traffic.values, alpha=0.3, color='purple')
            ax4.set_xlabel('Hour of Day', fontsize=10, fontweight='bold')
            ax4.set_ylabel('Vehicle Volume', fontsize=10, fontweight='bold')
            ax4.set_title('SCATS Traffic Volume - Hourly', fontsize=11, fontweight='bold')
            ax4.grid(alpha=0.3)
        
        # 5. Day of Week Analysis
        if self.footfall_data is not None:
            ax5 = fig.add_subplot(gs[2, 0])
            day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            daily_footfall = self.footfall_data.groupby('day_of_week')['total_pedestrians'].sum()
            colors_dow = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE']
            ax5.bar(range(7), [daily_footfall.get(i, 0) for i in range(7)], color=colors_dow, alpha=0.7, edgecolor='black')
            ax5.set_xlabel('Day of Week', fontsize=10, fontweight='bold')
            ax5.set_ylabel('Total Pedestrians', fontsize=10, fontweight='bold')
            ax5.set_title('Weekly Footfall Pattern', fontsize=11, fontweight='bold')
            ax5.set_xticks(range(7))
            ax5.set_xticklabels(day_names)
            ax5.grid(axis='y', alpha=0.3)
        
        # 6. Session Light Levels
        if self.session_data is not None:
            ax6 = fig.add_subplot(gs[2, 1])
            hourly_light = self.session_data.groupby('hour')['lightLux'].mean()
            ax6.plot(hourly_light.index, hourly_light.values, marker='o', linewidth=2, color='orange')
            ax6.fill_between(hourly_light.index, hourly_light.values, alpha=0.3, color='orange')
            ax6.set_xlabel('Hour of Day', fontsize=10, fontweight='bold')
            ax6.set_ylabel('Light Level (Lux)', fontsize=10, fontweight='bold')
            ax6.set_title('Ambient Light Levels - Costa Coffee', fontsize=11, fontweight='bold')
            ax6.grid(alpha=0.3)
        
        # 7. Business Recommendations
        ax7 = fig.add_subplot(gs[2, 2])
        ax7.axis('off')
        
        # Generate recommendations
        top_hour = walkby_df.loc[walkby_df['score'].idxmax()]
        low_hours = walkby_df.nsmallest(3, 'score')
        
        recommendations = f"""
        📊 BUSINESS INSIGHTS
        {'='*35}
        
        🎯 PEAK OPPORTUNITY:
        {top_hour['hour']:02d}:00 - Highest walk-by
        potential (Score: {top_hour['score']:.2f})
        
        ✅ RECOMMENDATIONS:
        • Staff more during peak hours
        • Place signage at {top_hour['hour']-1:02d}:00-{top_hour['hour']+1:02d}:00
        • Outdoor seating at peak times
        
        ⚠️ LOW TRAFFIC PERIODS:
        """
        for _, row in low_hours.iterrows():
            recommendations += f"  {row['hour']:02d}:00 (Score: {row['score']:.2f})\n        "
        
        recommendations += f"""
        
        💡 STRATEGIES:
        • Run promotions during low hours
        • Focus on dwell time
        • Consider reduced staffing
        """
        
        ax7.text(0.1, 0.95, recommendations, 
                transform=ax7.transAxes,
                fontsize=10,
                verticalalignment='top',
                fontfamily='monospace',
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))
        
        plt.suptitle('Local Commerce Traffic Flow Analysis - Costa Coffee @ Trinity College', 
                    fontsize=16, fontweight='bold', y=0.995)
        
        # Save the figure
        output_file = output_dir / "comprehensive_dashboard.png"
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        print(f"✓ Saved comprehensive dashboard: {output_file}")
        
        plt.close()
    
    def generate_location_map(self):
        """Generate a map showing SCATS locations near Costa Coffee"""
        if self.scats_locations is None:
            return
        
        print("\nGenerating location map...")
        output_dir = self.base_path / "analysis_output"
        output_dir.mkdir(exist_ok=True)
        
        nearby_sites = self.find_nearby_scats_sites(
            self.costa_location['lat'], 
            self.costa_location['lon'], 
            radius_km=2.0
        )
        
        fig, ax = plt.subplots(figsize=(14, 10))
        
        # Plot all SCATS sites in light gray
        ax.scatter(self.scats_locations['Long'], self.scats_locations['Lat'], 
                  c='lightgray', s=20, alpha=0.3, label='All SCATS Sites')
        
        # Plot nearby sites in blue
        if nearby_sites is not None and len(nearby_sites) > 0:
            ax.scatter(nearby_sites['Long'], nearby_sites['Lat'], 
                      c='blue', s=100, alpha=0.6, label='Nearby SCATS Sites', edgecolors='navy', linewidth=2)
            
            # Label top 5 nearest sites
            for idx, site in nearby_sites.head(5).iterrows():
                ax.annotate(f"{site['Site_ID']}\n({site['distance_km']:.2f}km)", 
                           xy=(site['Long'], site['Lat']),
                           xytext=(10, 10), textcoords='offset points',
                           fontsize=8, bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.7))
        
        # Plot Costa Coffee location
        ax.scatter(self.costa_location['lon'], self.costa_location['lat'], 
                  c='red', s=500, marker='*', label='Costa Coffee @ Trinity', 
                  edgecolors='darkred', linewidth=2, zorder=5)
        
        ax.set_xlabel('Longitude', fontsize=12, fontweight='bold')
        ax.set_ylabel('Latitude', fontsize=12, fontweight='bold')
        ax.set_title('Traffic Monitoring Sites Near Costa Coffee @ Trinity College', 
                    fontsize=14, fontweight='bold')
        ax.legend(fontsize=10)
        ax.grid(alpha=0.3)
        
        # Add circle showing 2km radius
        circle = plt.Circle((self.costa_location['lon'], self.costa_location['lat']), 
                           0.018, color='red', fill=False, linestyle='--', linewidth=2, label='2km radius')
        ax.add_patch(circle)
        
        output_file = output_dir / "location_map.png"
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        print(f"✓ Saved location map: {output_file}")
        plt.close()
    
    def generate_report(self, walkby_df):
        """Generate a comprehensive text report"""
        print("\nGenerating text report...")
        output_dir = self.base_path / "analysis_output"
        output_dir.mkdir(exist_ok=True)
        
        report = []
        report.append("="*80)
        report.append("LOCAL COMMERCE TRAFFIC FLOW ANALYSIS")
        report.append("Costa Coffee @ Trinity College, Dublin")
        report.append("="*80)
        report.append(f"\nReport Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("\n" + "="*80)
        report.append("EXECUTIVE SUMMARY")
        report.append("="*80)
        
        # Peak hours
        peak_hours = walkby_df.nlargest(3, 'score')
        report.append("\n📊 TOP 3 PEAK WALK-BY PERIODS:")
        for i, (idx, row) in enumerate(peak_hours.iterrows(), 1):
            report.append(f"  #{i}: {row['hour']:02d}:00-{row['hour']+1:02d}:00 - Walk-by Score: {row['score']:.2f}")
        
        # Low traffic periods
        low_hours = walkby_df.nsmallest(3, 'score')
        report.append("\n⚠️  LOWEST TRAFFIC PERIODS:")
        for i, (idx, row) in enumerate(low_hours.iterrows(), 1):
            report.append(f"  #{i}: {row['hour']:02d}:00-{row['hour']+1:02d}:00 - Walk-by Score: {row['score']:.2f}")
        
        # Data sources summary
        report.append("\n" + "="*80)
        report.append("DATA SOURCES")
        report.append("="*80)
        
        if self.footfall_data is not None:
            report.append(f"\n✓ DLR Footfall Data: {len(self.footfall_data)} records")
            report.append(f"  Date Range: {self.footfall_data['Time'].min()} to {self.footfall_data['Time'].max()}")
        
        if self.scats_locations is not None:
            report.append(f"\n✓ SCATS Location Data: {len(self.scats_locations)} monitoring sites")
            nearby = self.find_nearby_scats_sites(self.costa_location['lat'], self.costa_location['lon'], 2.0)
            if nearby is not None:
                report.append(f"  Sites within 2km of Costa: {len(nearby)}")
        
        if self.scats_volume_data is not None:
            report.append(f"\n✓ SCATS Traffic Volume: {len(self.scats_volume_data)} records (sample)")
            total_vehicles = self.scats_volume_data['Sum_Volume'].sum()
            report.append(f"  Total Vehicle Count: {total_vehicles:,}")
        
        if self.session_data is not None:
            report.append(f"\n✓ Manual Sensor Data: {len(self.session_data)} samples")
            sessions = self.session_data['sessionId'].nunique()
            report.append(f"  Collection Sessions: {sessions}")
            report.append(f"  Location: Costa Coffee @ Trinity College")
        
        # Business recommendations
        report.append("\n" + "="*80)
        report.append("BUSINESS RECOMMENDATIONS")
        report.append("="*80)
        
        top_hour = walkby_df.loc[walkby_df['score'].idxmax()]
        
        report.append(f"\n🎯 MAXIMIZE PEAK OPPORTUNITY ({top_hour['hour']:02d}:00-{top_hour['hour']+1:02d}:00):")
        report.append(f"  • Increase staffing 30 minutes before peak")
        report.append(f"  • Deploy outdoor signage at {top_hour['hour']-1:02d}:00")
        report.append(f"  • Consider outdoor seating/display during this period")
        report.append(f"  • Staff greeting at entrance during peak")
        
        report.append("\n💡 OPTIMIZE LOW-TRAFFIC PERIODS:")
        for idx, row in low_hours.iterrows():
            report.append(f"  • {row['hour']:02d}:00-{row['hour']+1:02d}:00: Run targeted promotions")
        report.append(f"  • Focus on dwell time and repeat customers")
        report.append(f"  • Reduce staffing to minimum during these hours")
        
        report.append("\n📈 CONVERSION STRATEGY:")
        report.append(f"  • Current peak walk-by score: {top_hour['score']:.2f}")
        report.append(f"  • Target: Convert 5-10% of walk-by traffic")
        report.append(f"  • Methods: Signage, window display, aroma, visibility")
        
        report.append("\n🔄 CONTINUOUS MONITORING:")
        report.append(f"  • Track actual conversion rates during peak hours")
        report.append(f"  • Compare weekday vs weekend patterns")
        report.append(f"  • Monitor impact of external events (transport delays, weather)")
        
        # Save report
        report_file = output_dir / "business_report.txt"
        with open(report_file, 'w') as f:
            f.write('\n'.join(report))
        
        print(f"✓ Saved business report: {report_file}")
        
        # Also print to console
        print("\n" + '\n'.join(report))
    
    def run_full_analysis(self):
        """Run the complete analysis pipeline"""
        print("\n" + "="*80)
        print("STARTING FULL ANALYSIS PIPELINE")
        print("="*80 + "\n")
        
        # Load all data
        self.load_footfall_data()
        self.load_scats_locations()
        self.load_scats_volume_data_sample(nrows=500000)  # Load 500k rows
        self.load_session_data()
        
        # Perform analyses
        self.analyze_session_patterns()
        self.analyze_footfall_patterns()
        self.analyze_traffic_volume_near_costa()
        
        # Calculate walk-by potential
        walkby_df = self.calculate_walkby_potential()
        
        # Generate visualizations
        if walkby_df is not None:
            self.visualize_comprehensive_analysis(walkby_df)
            self.generate_location_map()
            self.generate_report(walkby_df)
        
        print("\n" + "="*80)
        print("✓ ANALYSIS COMPLETE!")
        print("="*80)
        print(f"\nResults saved to: {self.base_path / 'analysis_output'}")


def main():
    """Main entry point"""
    base_path = Path(__file__).parent
    
    analyzer = TrafficAnalyzer(base_path)
    analyzer.run_full_analysis()


if __name__ == "__main__":
    main()



