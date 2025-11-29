#!/usr/bin/env python3
"""
Interactive Dashboard Generator for Local Commerce Traffic Flow Analysis
Creates an HTML dashboard with interactive visualizations
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path
from datetime import datetime
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots

class DashboardGenerator:
    """Generate an interactive HTML dashboard"""
    
    def __init__(self, base_path):
        self.base_path = Path(base_path)
        self.footfall_data = None
        self.scats_locations = None
        self.scats_volume_data = None
        self.session_data = None
        self.costa_location = {"lat": 53.3441, "lon": -6.2572}
        
    def load_all_data(self):
        """Load all necessary data"""
        print("Loading data for dashboard...")
        
        # Load footfall data
        footfall_files = list((self.base_path / "automated_collection/open-data/dlr_footfall").rglob("*.csv"))
        if footfall_files:
            self.footfall_data = pd.read_csv(footfall_files[0])
            self.footfall_data['Time'] = pd.to_datetime(self.footfall_data['Time'])
            self.footfall_data['hour'] = self.footfall_data['Time'].dt.hour
            pedestrian_columns = [col for col in self.footfall_data.columns if 'Pedestrian' in col and 'OUT' not in col and 'IN' not in col]
            if pedestrian_columns:
                self.footfall_data['total_pedestrians'] = self.footfall_data[pedestrian_columns].sum(axis=1)
        
        # Load SCATS locations
        location_files = list((self.base_path / "automated_collection/open-data/dlr_scats_locations").rglob("*.csv"))
        if location_files:
            self.scats_locations = pd.read_csv(location_files[0])
        
        # Load SCATS volume (sample)
        scats_file = self.base_path / "SCATSMay2025.csv"
        if scats_file.exists():
            self.scats_volume_data = pd.read_csv(scats_file, nrows=500000)
            self.scats_volume_data['End_Time'] = pd.to_datetime(self.scats_volume_data['End_Time'], format='%Y%m%d%H%M%S')
            self.scats_volume_data['hour'] = self.scats_volume_data['End_Time'].dt.hour
        
        # Load session data
        session_files = list((self.base_path / "automated_collection/sessions").rglob("*.json"))
        all_sessions = []
        for session_file in session_files:
            with open(session_file, 'r') as f:
                session = json.load(f)
                samples = json.loads(session['samples'])
                for sample in samples:
                    sample['deviceId'] = session['deviceId']
                    sample['sessionId'] = session['sessionId']
                    sample['date'] = session['date']
                    sample['datetime'] = pd.to_datetime(sample['ts'], unit='ms')
                    all_sessions.append(sample)
        
        if all_sessions:
            self.session_data = pd.DataFrame(all_sessions)
            self.session_data['hour'] = self.session_data['datetime'].dt.hour
        
        print("✓ Data loaded successfully")
    
    def calculate_walkby_scores(self):
        """Calculate walk-by potential scores"""
        hours = range(24)
        walkby_scores = []
        
        for hour in hours:
            score = 0
            
            # Footfall component
            if self.footfall_data is not None:
                footfall_hour = self.footfall_data[self.footfall_data['hour'] == hour]
                if len(footfall_hour) > 0:
                    avg_pedestrians = footfall_hour['total_pedestrians'].mean()
                    score += avg_pedestrians / 100
            
            # Session activity component
            if self.session_data is not None:
                session_hour = self.session_data[self.session_data['hour'] == hour]
                if len(session_hour) > 0:
                    avg_audio = session_hour['audioDb'].mean()
                    audio_score = (avg_audio + 70) / 10
                    score += max(0, audio_score)
            
            # Traffic component
            if self.scats_volume_data is not None:
                traffic_hour = self.scats_volume_data[self.scats_volume_data['hour'] == hour]
                if len(traffic_hour) > 0:
                    avg_volume = traffic_hour['Sum_Volume'].mean()
                    score += avg_volume / 50
            
            walkby_scores.append({'hour': hour, 'score': score})
        
        return pd.DataFrame(walkby_scores)
    
    def create_dashboard(self):
        """Create the interactive dashboard"""
        print("Creating interactive dashboard...")
        
        walkby_df = self.calculate_walkby_scores()
        
        # Create subplots
        fig = make_subplots(
            rows=3, cols=2,
            subplot_titles=(
                'Walk-by Potential Score Throughout the Day',
                'DLR Footfall - Hourly Average',
                'Costa Coffee Activity - Audio Levels',
                'SCATS Traffic Volume - Hourly',
                'Day of Week Pattern',
                'Ambient Light Levels'
            ),
            specs=[
                [{"colspan": 2}, None],
                [{}, {}],
                [{}, {}]
            ],
            vertical_spacing=0.12,
            horizontal_spacing=0.15
        )
        
        # 1. Walk-by Potential Score (main chart)
        fig.add_trace(
            go.Bar(
                x=walkby_df['hour'],
                y=walkby_df['score'],
                name='Walk-by Score',
                marker=dict(
                    color=walkby_df['score'],
                    colorscale='Viridis',
                    showscale=True,
                    colorbar=dict(title="Score", x=1.1)
                ),
                hovertemplate='<b>Hour:</b> %{x}:00<br><b>Score:</b> %{y:.2f}<extra></extra>'
            ),
            row=1, col=1
        )
        
        # Add peak annotations
        peak_hours = walkby_df.nlargest(3, 'score')
        for idx, row in peak_hours.iterrows():
            fig.add_annotation(
                x=row['hour'],
                y=row['score'],
                text=f"PEAK<br>{row['score']:.1f}",
                showarrow=True,
                arrowhead=2,
                arrowsize=1,
                arrowwidth=2,
                arrowcolor="red",
                ax=0,
                ay=-40,
                bgcolor="yellow",
                opacity=0.8,
                row=1, col=1
            )
        
        # 2. Footfall Patterns
        if self.footfall_data is not None:
            hourly_footfall = self.footfall_data.groupby('hour')['total_pedestrians'].mean()
            fig.add_trace(
                go.Scatter(
                    x=hourly_footfall.index,
                    y=hourly_footfall.values,
                    mode='lines+markers',
                    name='Pedestrians',
                    line=dict(color='green', width=3),
                    fill='tozeroy',
                    fillcolor='rgba(0,255,0,0.2)',
                    hovertemplate='<b>Hour:</b> %{x}:00<br><b>Pedestrians:</b> %{y:.0f}<extra></extra>'
                ),
                row=2, col=1
            )
        
        # 3. Session Activity (Audio)
        if self.session_data is not None:
            hourly_audio = self.session_data.groupby('hour')['audioDb'].mean()
            fig.add_trace(
                go.Bar(
                    x=hourly_audio.index,
                    y=hourly_audio.values,
                    name='Audio Level',
                    marker=dict(color='coral'),
                    hovertemplate='<b>Hour:</b> %{x}:00<br><b>Audio:</b> %{y:.1f} dB<extra></extra>'
                ),
                row=2, col=2
            )
            
            # Add busy threshold line
            fig.add_hline(y=-50, line_dash="dash", line_color="red", 
                         annotation_text="Busy Threshold", row=2, col=2)
        
        # 4. Traffic Volume
        if self.scats_volume_data is not None:
            hourly_traffic = self.scats_volume_data.groupby('hour')['Sum_Volume'].sum()
            fig.add_trace(
                go.Scatter(
                    x=hourly_traffic.index,
                    y=hourly_traffic.values,
                    mode='lines+markers',
                    name='Traffic Volume',
                    line=dict(color='purple', width=3),
                    fill='tozeroy',
                    fillcolor='rgba(128,0,128,0.2)',
                    hovertemplate='<b>Hour:</b> %{x}:00<br><b>Vehicles:</b> %{y:,.0f}<extra></extra>'
                ),
                row=3, col=1
            )
        
        # 5. Day of Week Pattern
        if self.footfall_data is not None:
            self.footfall_data['day_of_week'] = self.footfall_data['Time'].dt.dayofweek
            daily_footfall = self.footfall_data.groupby('day_of_week')['total_pedestrians'].sum()
            day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            fig.add_trace(
                go.Bar(
                    x=day_names,
                    y=[daily_footfall.get(i, 0) for i in range(7)],
                    name='Daily Traffic',
                    marker=dict(
                        color=['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', 
                               '#98D8C8', '#F7DC6F', '#BB8FCE']
                    ),
                    hovertemplate='<b>Day:</b> %{x}<br><b>Total:</b> %{y:,.0f}<extra></extra>'
                ),
                row=3, col=2
            )
        
        # Update layout
        fig.update_layout(
            title=dict(
                text='<b>Local Commerce Traffic Flow - Interactive Dashboard</b><br>' +
                     '<sub>Costa Coffee @ Trinity College, Dublin</sub>',
                x=0.5,
                xanchor='center',
                font=dict(size=24)
            ),
            height=1200,
            showlegend=False,
            hovermode='x unified',
            plot_bgcolor='rgba(240,240,240,0.5)'
        )
        
        # Update axes
        fig.update_xaxes(title_text="Hour of Day", row=1, col=1)
        fig.update_yaxes(title_text="Walk-by Score", row=1, col=1)
        
        fig.update_xaxes(title_text="Hour", row=2, col=1)
        fig.update_yaxes(title_text="Pedestrians", row=2, col=1)
        
        fig.update_xaxes(title_text="Hour", row=2, col=2)
        fig.update_yaxes(title_text="Audio (dB)", row=2, col=2)
        
        fig.update_xaxes(title_text="Hour", row=3, col=1)
        fig.update_yaxes(title_text="Vehicles", row=3, col=1)
        
        fig.update_xaxes(title_text="Day", row=3, col=2)
        fig.update_yaxes(title_text="Total Pedestrians", row=3, col=2)
        
        return fig, walkby_df
    
    def create_location_map(self):
        """Create an interactive map showing SCATS locations"""
        print("Creating interactive location map...")
        
        if self.scats_locations is None:
            return None
        
        # Calculate distances from Costa
        from math import radians, sin, cos, sqrt, atan2
        
        def calc_distance(lat1, lon1, lat2, lon2):
            R = 6371
            lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * atan2(sqrt(a), sqrt(1-a))
            return R * c
        
        self.scats_locations['distance_km'] = self.scats_locations.apply(
            lambda row: calc_distance(
                self.costa_location['lat'], 
                self.costa_location['lon'],
                row['Lat'], 
                row['Long']
            ),
            axis=1
        )
        
        # Create map
        fig = go.Figure()
        
        # All SCATS sites
        fig.add_trace(go.Scattermapbox(
            lat=self.scats_locations['Lat'],
            lon=self.scats_locations['Long'],
            mode='markers',
            marker=dict(size=8, color='lightblue', opacity=0.6),
            text=self.scats_locations['Location'],
            hovertemplate='<b>%{text}</b><br>Site ID: %{customdata}<extra></extra>',
            customdata=self.scats_locations['Site_ID'],
            name='All SCATS Sites'
        ))
        
        # Nearby sites (within 2km)
        nearby = self.scats_locations[self.scats_locations['distance_km'] <= 2.0]
        if len(nearby) > 0:
            fig.add_trace(go.Scattermapbox(
                lat=nearby['Lat'],
                lon=nearby['Long'],
                mode='markers',
                marker=dict(size=12, color='blue', opacity=0.8),
                text=nearby['Location'],
                hovertemplate='<b>%{text}</b><br>Distance: %{customdata:.2f} km<extra></extra>',
                customdata=nearby['distance_km'],
                name='Nearby Sites (< 2km)'
            ))
        
        # Costa Coffee location
        fig.add_trace(go.Scattermapbox(
            lat=[self.costa_location['lat']],
            lon=[self.costa_location['lon']],
            mode='markers',
            marker=dict(size=20, color='red', symbol='star'),
            text=['Costa Coffee @ Trinity College'],
            hovertemplate='<b>%{text}</b><extra></extra>',
            name='Costa Coffee'
        ))
        
        fig.update_layout(
            title='Traffic Monitoring Sites Near Costa Coffee',
            mapbox=dict(
                style='open-street-map',
                center=dict(
                    lat=self.costa_location['lat'],
                    lon=self.costa_location['lon']
                ),
                zoom=11
            ),
            height=600,
            margin=dict(l=0, r=0, t=40, b=0)
        )
        
        return fig
    
    def generate_html_dashboard(self):
        """Generate complete HTML dashboard"""
        self.load_all_data()
        
        dashboard_fig, walkby_df = self.create_dashboard()
        map_fig = self.create_location_map()
        
        # Get key insights
        peak_hour = walkby_df.loc[walkby_df['score'].idxmax()]
        peak_hour_int = int(peak_hour['hour'])
        low_hours = walkby_df.nsmallest(3, 'score')
        
        # Create HTML
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Local Commerce Traffic Flow Dashboard</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }}
        .container {{
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }}
        .header {{
            background: white;
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }}
        .header h1 {{
            margin: 0 0 10px 0;
            color: #333;
            font-size: 2.5em;
        }}
        .header p {{
            margin: 5px 0;
            color: #666;
            font-size: 1.1em;
        }}
        .insights {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .insight-card {{
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            transition: transform 0.3s ease;
        }}
        .insight-card:hover {{
            transform: translateY(-5px);
        }}
        .insight-card h3 {{
            margin: 0 0 15px 0;
            color: #667eea;
            font-size: 1.3em;
        }}
        .insight-card .value {{
            font-size: 2.5em;
            font-weight: bold;
            color: #333;
            margin: 10px 0;
        }}
        .insight-card .label {{
            color: #666;
            font-size: 1em;
        }}
        .chart-container {{
            background: white;
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }}
        .recommendations {{
            background: white;
            border-radius: 15px;
            padding: 30px;
            margin-top: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }}
        .recommendations h2 {{
            color: #667eea;
            margin-top: 0;
        }}
        .recommendation-section {{
            margin: 20px 0;
            padding: 15px;
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            border-radius: 5px;
        }}
        .recommendation-section h4 {{
            margin: 0 0 10px 0;
            color: #333;
        }}
        .recommendation-section ul {{
            margin: 5px 0;
            padding-left: 20px;
        }}
        .recommendation-section li {{
            margin: 5px 0;
            color: #555;
        }}
        .footer {{
            text-align: center;
            padding: 20px;
            color: white;
            font-size: 0.9em;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏪 Local Commerce Traffic Flow Dashboard</h1>
            <p><strong>Location:</strong> Costa Coffee @ Trinity College, Dublin</p>
            <p><strong>Analysis Date:</strong> {datetime.now().strftime('%B %d, %Y')}</p>
            <p><strong>Project:</strong> Identifying Walk-by Potential through Crowdsensing</p>
        </div>
        
        <div class="insights">
            <div class="insight-card">
                <h3>🎯 Peak Walk-by Hour</h3>
                <div class="value">{peak_hour_int:02d}:00</div>
                <div class="label">Highest Traffic Potential</div>
                <div class="label">Score: {peak_hour['score']:.2f}</div>
            </div>
            
            <div class="insight-card">
                <h3>📊 Total Data Points</h3>
                <div class="value">{len(self.footfall_data) if self.footfall_data is not None else 0:,}</div>
                <div class="label">Footfall Records Analyzed</div>
            </div>
            
            <div class="insight-card">
                <h3>📍 Monitoring Sites</h3>
                <div class="value">{len(self.scats_locations) if self.scats_locations is not None else 0}</div>
                <div class="label">SCATS Traffic Sites</div>
            </div>
            
            <div class="insight-card">
                <h3>📱 Manual Collections</h3>
                <div class="value">{self.session_data['sessionId'].nunique() if self.session_data is not None else 0}</div>
                <div class="label">Sensor Sessions @ Costa</div>
            </div>
        </div>
        
        <div class="chart-container">
            <div id="dashboard"></div>
        </div>
        
        <div class="chart-container">
            <div id="map"></div>
        </div>
        
        <div class="recommendations">
            <h2>💡 Business Recommendations</h2>
            
            <div class="recommendation-section">
                <h4>🎯 Maximize Peak Opportunity ({peak_hour_int:02d}:00-{peak_hour_int+1:02d}:00)</h4>
                <ul>
                    <li><strong>Staff Management:</strong> Increase staffing 30 minutes before peak (at {peak_hour_int-1:02d}:30)</li>
                    <li><strong>Outdoor Signage:</strong> Deploy A-frame signs and outdoor displays at {peak_hour_int-1:02d}:00</li>
                    <li><strong>Customer Engagement:</strong> Position staff at entrance for greeting during peak</li>
                    <li><strong>Seating Strategy:</strong> Consider outdoor seating during this high-traffic period</li>
                    <li><strong>Special Offers:</strong> Promote quick-service items to maximize throughput</li>
                </ul>
            </div>
            
            <div class="recommendation-section">
                <h4>⚡ Optimize Low-Traffic Periods</h4>
                <ul>
                    <li><strong>Early Morning (03:00-06:00):</strong> Reduce to skeleton staff, focus on prep work</li>
                    <li><strong>Promotions:</strong> Run "Happy Hour" style promotions during low-traffic times</li>
                    <li><strong>Customer Retention:</strong> Focus on dwell time and repeat customers during slow periods</li>
                    <li><strong>Cost Control:</strong> Adjust heating/cooling and lighting during minimal traffic hours</li>
                </ul>
            </div>
            
            <div class="recommendation-section">
                <h4>📈 Conversion Strategy</h4>
                <ul>
                    <li><strong>Current Potential:</strong> Peak walk-by score of {peak_hour['score']:.2f}</li>
                    <li><strong>Target:</strong> Convert 5-10% of walk-by traffic into customers</li>
                    <li><strong>Methods:</strong> Eye-catching signage, window displays, aroma marketing, staff visibility</li>
                    <li><strong>Measurement:</strong> Track manual counts during peak hours for 1 week</li>
                    <li><strong>A/B Testing:</strong> Test different signage positions and messaging</li>
                </ul>
            </div>
            
            <div class="recommendation-section">
                <h4>🔄 Continuous Monitoring</h4>
                <ul>
                    <li>Track actual walk-in vs walk-by ratios during peak hours</li>
                    <li>Compare weekday vs weekend patterns</li>
                    <li>Monitor impact of external events (transport delays, weather, events)</li>
                    <li>Correlate sales data with traffic patterns</li>
                    <li>Adjust strategies based on seasonal changes</li>
                </ul>
            </div>
            
            <div class="recommendation-section">
                <h4>🚌 Transport Integration</h4>
                <ul>
                    <li>Monitor bus/Luas schedules and correlate with foot traffic spikes</li>
                    <li>Position staff near entrance during transport arrival times</li>
                    <li>Consider partnerships with Dublin Bus for commuter promotions</li>
                    <li>Track impact of transport disruptions on traffic patterns</li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p>Urban Computing Project - Smart City Analysis</p>
            <p>Data Sources: DLR Footfall, SCATS Traffic, Manual Sensor Collection</p>
        </div>
    </div>
    
    <script>
        // Dashboard
        var dashboardData = {dashboard_fig.to_json()};
        Plotly.newPlot('dashboard', dashboardData.data, dashboardData.layout, {{responsive: true}});
        
        // Map
        {f"var mapData = {map_fig.to_json()};" if map_fig else ""}
        {f"Plotly.newPlot('map', mapData.data, mapData.layout, {{responsive: true}});" if map_fig else ""}
    </script>
</body>
</html>
"""
        
        # Save HTML
        output_dir = self.base_path / "analysis_output"
        output_dir.mkdir(exist_ok=True)
        
        html_file = output_dir / "interactive_dashboard.html"
        with open(html_file, 'w') as f:
            f.write(html_content)
        
        print(f"✓ Saved interactive dashboard: {html_file}")
        print(f"\nTo view the dashboard, open: {html_file}")
        
        return html_file


def main():
    base_path = Path(__file__).parent
    generator = DashboardGenerator(base_path)
    html_file = generator.generate_html_dashboard()
    
    print("\n" + "="*80)
    print("✓ INTERACTIVE DASHBOARD CREATED!")
    print("="*80)
    print(f"\n📊 Open this file in your browser:\n   {html_file}")
    print("\n💡 The dashboard includes:")
    print("   • Interactive charts with hover details")
    print("   • Zoomable visualizations")
    print("   • Location map with SCATS sites")
    print("   • Actionable business recommendations")


if __name__ == "__main__":
    main()

