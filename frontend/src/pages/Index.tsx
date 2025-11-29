import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, LineChart, Line } from "recharts";
import { MapPin, TrendingUp, Users, Activity, Clock, AlertCircle, Loader2, Search, X } from "lucide-react";
import { generateTrafficData, getDataStats, loadBusinessData, type TrafficDataPoint } from "@/lib/dataService";
import { generateRealTrafficData, type BusinessMetrics } from "@/lib/realDataService";
import { generateAIRecommendations } from "@/lib/geminiService";
import { 
  loadSCATSLocations, 
  analyzeLocation, 
  searchLocationsByRoadName,
  findNearestSCATSLocation,
  type SCATSLocation,
  type LocationAnalysis 
} from "@/lib/scatsService";
import InteractiveMap from "@/components/InteractiveMap";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const Index = () => {
  const [selectedHour, setSelectedHour] = useState(13);
  const [trafficData, setTrafficData] = useState<TrafficDataPoint[]>([]);
  const [realMetrics, setRealMetrics] = useState<BusinessMetrics | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<string[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState("Explore Locations on the Map");
  const [selectedBusiness, setSelectedBusiness] = useState<'costa' | 'tbc' | 'all' | null>(null);
  
  // Map and location state
  const [scatsLocations, setScatsLocations] = useState<SCATSLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<SCATSLocation | null>(null);
  const [locationAnalysis, setLocationAnalysis] = useState<LocationAnalysis | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([53.35, -6.26]); // Default: Dublin center
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SCATSLocation[]>([]);
  const [analyzingLocation, setAnalyzingLocation] = useState(false);
  
  // Load SCATS locations on mount
  useEffect(() => {
    async function loadLocations() {
      const locations = await loadSCATSLocations();
      setScatsLocations(locations);
    }
    loadLocations();
  }, []);
  
  // Load traffic data when business is selected
  useEffect(() => {
    async function loadData() {
      if (selectedBusiness === null) {
        setTrafficData([]);
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        // Load real metrics for specific businesses
        if (selectedBusiness === 'costa' || selectedBusiness === 'tbc') {
          const metrics = await generateRealTrafficData(selectedBusiness);
          setRealMetrics(metrics);
          
          // Convert to TrafficDataPoint format
          const data = metrics.hourlyData.map(hd => ({
            hour: hd.hour,
            score: hd.score,
            pedestrians: hd.pedestrians,
            traffic: hd.traffic,
            activity: hd.activity,
          }));
          setTrafficData(data);
          
          // Update business name and center
          const business = await loadBusinessData(selectedBusiness);
          setBusinessName(business.name);
          setMapCenter([business.lat, business.lon]);
          
          // Analyze SCATS potential around business location
          let locationsToUse = scatsLocations;
          if (locationsToUse.length === 0) {
            locationsToUse = await loadSCATSLocations();
            setScatsLocations(locationsToUse);
          }
          const scatsAnalysis = await analyzeLocation(business.lat, business.lon, locationsToUse);
          setLocationAnalysis(scatsAnalysis);
          
          // Generate AI recommendations
          setLoadingRecommendations(true);
          setAiRecommendations([]); // Clear previous
          try {
            const aiRecs = await generateAIRecommendations(metrics, business.name);
            setAiRecommendations(aiRecs);
          } catch (error) {
            console.error('Error generating AI recommendations:', error);
            // Keep empty array to fall back to basic recommendations
            setAiRecommendations([]);
          } finally {
            setLoadingRecommendations(false);
          }
        } else {
          // Combined view - use fallback method
          setRealMetrics(null);
          setAiRecommendations([]);
          setLocationAnalysis(null);
          const data = await generateTrafficData(undefined);
          setTrafficData(data);
          setBusinessName("Combined Analysis - All Locations");
        }
      } catch (error) {
        console.error('Error loading data:', error);
        setTrafficData([]);
        setRealMetrics(null);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [selectedBusiness, scatsLocations]);
  
  // Handle search
  const handleSearch = () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    // Try to parse as coordinates
    const coordMatch = searchQuery.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        handleLocationSelect(lat, lon);
        return;
      }
    }
    
    // Search by road name
    const results = searchLocationsByRoadName(searchQuery, scatsLocations);
    setSearchResults(results);
    
    if (results.length === 1) {
      handleLocationClick(results[0]);
    } else if (results.length > 0) {
      // Show first result
      handleLocationClick(results[0]);
    }
  };
  
  // Handle location selection from map click
  const handleLocationSelect = async (lat: number, lon: number) => {
    setAnalyzingLocation(true);
    setMapCenter([lat, lon]);
    
    const nearest = findNearestSCATSLocation(lat, lon, scatsLocations);
    if (nearest) {
      setSelectedLocation(nearest);
      const analysis = await analyzeLocation(lat, lon, scatsLocations);
      setLocationAnalysis(analysis);
    } else {
      setSelectedLocation(null);
      setLocationAnalysis(null);
    }
    
    setAnalyzingLocation(false);
  };
  
  // Handle marker click
  const handleLocationClick = async (location: SCATSLocation) => {
    setAnalyzingLocation(true);
    setSelectedLocation(location);
    setMapCenter([location.Lat, location.Long]);
    setSearchQuery(location.Location);
    
    const analysis = await analyzeLocation(location.Lat, location.Long, scatsLocations);
    setLocationAnalysis(analysis);
    setAnalyzingLocation(false);
  };
  
  const peakData = realMetrics 
    ? { 
        hour: realMetrics.peakHour, 
        score: realMetrics.peakScore, 
        pedestrians: realMetrics.peakFootfall, 
        traffic: trafficData.find(d => d.hour === realMetrics.peakHour)?.traffic || 0,
        activity: trafficData.find(d => d.hour === realMetrics.peakHour)?.activity || -70
      }
    : (trafficData.length > 0 
        ? trafficData.reduce((max, item) => item.score > max.score ? item : max, trafficData[0])
        : { hour: 0, score: 0, pedestrians: 0, traffic: 0, activity: -70 });
  
  const selectedData = trafficData.find(d => d.hour === selectedHour) || peakData;
  
  // Get statistics - use real metrics if available
  const stats = realMetrics
    ? {
        peakData,
        totalPedestrians: realMetrics.peakFootfall,
        avgActivity: trafficData.reduce((sum, d) => sum + d.activity, 0) / trafficData.length,
        activityRate: realMetrics.activityRate,
      }
    : (trafficData.length > 0 ? getDataStats(trafficData) : {
        peakData,
        totalPedestrians: 0,
        avgActivity: -70,
        activityRate: 0,
      });
  
  // Format functions
  const formatHour = (hour: number) => `${hour.toString().padStart(2, '0')}:00`;
  const formatNumber = (num: number) => num.toLocaleString();
  const displayValue = (value?: number, suffix = '') => {
    if (value === undefined || value === null || value <= 0) return '—';
    return `${formatNumber(Math.round(value))}${suffix}`;
  };
  
  // Format Y-axis tick values to avoid overlapping
  const formatYAxisTick = (value: number) => {
    if (value === 0) return '0';
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  const peakWindow = useMemo(() => {
    if (!realMetrics) return null;
    const windowScores = realMetrics.hourlyData.filter(d => d.score >= realMetrics.peakScore * 0.85);
    if (!windowScores.length) return null;
    const start = windowScores[0].hour;
    const end = windowScores[windowScores.length - 1].hour;
    const avgPed = Math.max(1, Math.round(windowScores.reduce((sum, d) => sum + d.pedestrians, 0) / windowScores.length));
    return { start, end, avgPed, avgScore: windowScores.reduce((sum, d) => sum + d.score, 0) / windowScores.length };
  }, [realMetrics]);

  const lowWindow = useMemo(() => {
    if (!realMetrics) return null;
    const lowHours = realMetrics.hourlyData.filter(d => d.score < 2 && d.pedestrians < 60);
    if (!lowHours.length) return null;
    const start = lowHours[0].hour;
    const end = lowHours[lowHours.length - 1].hour;
    const avgPed = Math.max(1, Math.round(lowHours.reduce((sum, d) => sum + d.pedestrians, 0) / lowHours.length));
    return { start, end, avgPed };
  }, [realMetrics]);

  const sparklineData = useMemo(() => {
    return trafficData.map(d => ({
      hourLabel: formatHour(d.hour),
      score: parseFloat(d.score.toFixed(2)),
      pedestrians: d.pedestrians,
    }));
  }, [trafficData]);

  // Parse recommendations into structured visual data
  interface ParsedRecommendation {
    type: 'peak' | 'busy' | 'low' | 'activity' | 'strategy' | 'monitoring';
    title: string;
    period?: string;
    metrics: { label: string; value: string | number; unit?: string }[];
    actions: string[];
    color: string;
    icon: string;
  }

  const parsedRecommendations = useMemo(() => {
    if (!realMetrics) return [];
    
    const source = aiRecommendations.length > 0 ? aiRecommendations : (realMetrics?.recommendations || []);
    const parsed: ParsedRecommendation[] = [];
    
    let currentRec: Partial<ParsedRecommendation> | null = null;
    
    source.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      // Detect peak opportunity
      if (trimmed.match(/peak.*opportunity|peak.*analysis/i)) {
        if (currentRec) parsed.push(currentRec as ParsedRecommendation);
        const periodMatch = trimmed.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
        currentRec = {
          type: 'peak',
          title: 'Peak Opportunity',
          period: periodMatch ? `${periodMatch[1]}-${periodMatch[2]}` : `${formatHour(realMetrics.peakHour)}-${formatHour(realMetrics.peakHour + 1)}`,
          metrics: [],
          actions: [],
          color: 'primary',
          icon: '',
        };
      }
      // Detect busy periods
      else if (trimmed.match(/busy.*period|extended.*busy/i)) {
        if (currentRec) parsed.push(currentRec as ParsedRecommendation);
        const periodMatch = trimmed.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
        currentRec = {
          type: 'busy',
          title: 'Busy Period',
          period: periodMatch ? `${periodMatch[1]}-${periodMatch[2]}` : undefined,
          metrics: [],
          actions: [],
          color: 'primary',
          icon: '',
        };
      }
      // Detect low traffic
      else if (trimmed.match(/low.*traffic|low.*activity/i)) {
        if (currentRec) parsed.push(currentRec as ParsedRecommendation);
        const periodMatch = trimmed.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
        currentRec = {
          type: 'low',
          title: 'Low Activity Window',
          period: periodMatch ? `${periodMatch[1]}-${periodMatch[2]}` : undefined,
          metrics: [],
          actions: [],
          color: 'muted',
          icon: '',
        };
      }
      // Detect activity periods
      else if (trimmed.match(/activity.*period|high.*activity/i)) {
        if (currentRec) parsed.push(currentRec as ParsedRecommendation);
        currentRec = {
          type: 'activity',
          title: 'High Activity Periods',
          metrics: [],
          actions: [],
          color: 'accent',
          icon: '',
        };
      }
      // Extract metrics (numbers with labels)
      else if (currentRec && /\d+/.test(trimmed)) {
        const pedMatch = trimmed.match(/(\d+)\s*(?:pedestrians|pedestrian|passers?)/i);
        const scoreMatch = trimmed.match(/score[:\s]+([\d.]+)/i);
        const activityMatch = trimmed.match(/activity[:\s]+([-\d.]+)\s*dB/i);
        const trafficMatch = trimmed.match(/(\d+)\s*(?:traffic|vehicles?|volume)/i);
        const hourMatch = trimmed.match(/(\d+)\s*hours?/i);
        const percentMatch = trimmed.match(/(\d+)%/i);
        
        if (pedMatch) {
          currentRec.metrics.push({ label: 'Pedestrians', value: parseInt(pedMatch[1]), unit: '/hr' });
        }
        if (scoreMatch) {
          currentRec.metrics.push({ label: 'Score', value: parseFloat(scoreMatch[1]) });
        }
        if (activityMatch) {
          currentRec.metrics.push({ label: 'Activity', value: parseFloat(activityMatch[1]), unit: ' dB' });
        }
        if (trafficMatch) {
          currentRec.metrics.push({ label: 'Traffic', value: parseInt(trafficMatch[1]) });
        }
        if (hourMatch && !currentRec.period) {
          currentRec.metrics.push({ label: 'Duration', value: parseInt(hourMatch[1]), unit: ' hrs' });
        }
        if (percentMatch) {
          currentRec.metrics.push({ label: 'Conversion', value: parseInt(percentMatch[1]), unit: '%' });
        }
        
        // Extract actions
        if (trimmed.match(/increase|deploy|maintain|reduce|run|focus|ensure/i) && trimmed.length > 15) {
          currentRec.actions.push(trimmed.replace(/^[•\-\*]\s*/, ''));
        }
      }
      // Extract reason
      else if (currentRec && trimmed.match(/reason[:\s]+/i)) {
        const reason = trimmed.replace(/reason[:\s]+/i, '').trim();
        if (reason) currentRec.actions.push(reason);
      }
    });
    
    if (currentRec) parsed.push(currentRec as ParsedRecommendation);
    
    // Add fallback recommendations if none parsed
    if (parsed.length === 0 && realMetrics) {
      // Peak opportunity
      parsed.push({
        type: 'peak',
        title: 'Peak Opportunity',
        period: `${formatHour(realMetrics.peakHour)}-${formatHour(realMetrics.peakHour + 1)}`,
        metrics: [
          { label: 'Pedestrians', value: realMetrics.peakFootfall, unit: '/hr' },
          { label: 'Score', value: realMetrics.peakScore },
          { label: 'Activity', value: realMetrics.hourlyData[realMetrics.peakHour]?.activity || 0, unit: ' dB' },
        ],
        actions: [
          `Increase staffing by 50% at ${formatHour(Math.max(0, realMetrics.peakHour - 1))}`,
          `Expected conversion: ${Math.round(realMetrics.peakFootfall * 0.05)}-${Math.round(realMetrics.peakFootfall * 0.10)} customers`,
        ],
        color: 'primary',
        icon: '',
      });
      
      // Busy periods - only show if they have real quantifiable data
      realMetrics.busyPeriods
        .filter(period => {
          // Only include periods with actual data (at least 1 hour and meaningful metrics)
          const periodData = realMetrics.hourlyData.filter(d => d.hour >= period.start && d.hour <= period.end);
          if (periodData.length === 0) return false;
          
          const avgPed = periodData.reduce((sum, d) => sum + d.pedestrians, 0) / periodData.length;
          const avgScore = periodData.reduce((sum, d) => sum + d.score, 0) / periodData.length;
          
          // Only show if has meaningful pedestrians (> 30) or high score (> 6)
          return avgPed > 30 || avgScore > 6;
        })
        .forEach(period => {
          const periodData = realMetrics.hourlyData.filter(d => d.hour >= period.start && d.hour <= period.end);
          const avgPed = Math.round(periodData.reduce((sum, d) => sum + d.pedestrians, 0) / periodData.length);
          const avgScore = periodData.reduce((sum, d) => sum + d.score, 0) / periodData.length;
          const avgActivity = periodData.reduce((sum, d) => sum + d.activity, 0) / periodData.length;
          const duration = period.end - period.start + 1;
          
          // Only show metrics that have real data (not zeros or missing)
          const metrics: { label: string; value: string | number; unit?: string }[] = [];
          if (avgPed > 0) {
            metrics.push({ label: 'Pedestrians', value: avgPed, unit: '/hr' });
          }
          if (avgScore > 0) {
            metrics.push({ label: 'Score', value: parseFloat(avgScore.toFixed(1)) });
          }
          if (avgActivity > -70) {
            metrics.push({ label: 'Activity', value: parseFloat(avgActivity.toFixed(1)), unit: ' dB' });
          }
          if (duration > 0) {
            metrics.push({ label: 'Duration', value: duration, unit: ' hrs' });
          }
          
          if (metrics.length > 0) {
            parsed.push({
              type: 'busy',
              title: 'Busy Period',
              period: `${formatHour(period.start)}-${formatHour(period.end)}`,
              metrics: metrics,
              actions: [
                period.reason,
                `Maintain full staffing for ${duration} hour${duration > 1 ? 's' : ''}`,
              ],
              color: 'primary',
              icon: '',
            });
          }
        });
    }
    
    return parsed;
  }, [aiRecommendations, realMetrics]);

  const scatsSummary = useMemo(() => {
    if (!locationAnalysis) return null;
    return {
      avgVolume: locationAnalysis.avgVolume,
      weightedAvg: locationAnalysis.weightedAvg,
      siteId: locationAnalysis.siteId,
      location: locationAnalysis.location,
    };
  }, [locationAnalysis]);

  const locationPotential = useMemo(() => {
    if (!scatsSummary) return null;
    const base = scatsSummary.avgVolume || 0;
    const weighted = scatsSummary.weightedAvg || 0;
    return Math.max(0, Math.round(base * 0.6 + weighted * 40));
  }, [scatsSummary]);
  
  // Generate traffic data from location analysis
  const locationTrafficData = useMemo(() => {
    if (!locationAnalysis || locationAnalysis.hourlyData.length === 0) return [];
    
    return locationAnalysis.hourlyData.map(hd => ({
      hour: hd.hour,
      volume: hd.volume,
      score: hd.volume / 100, // Normalize for display
    }));
  }, [locationAnalysis]);
  
  if (loading && selectedBusiness !== null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading traffic data...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="bg-card rounded-2xl shadow-2xl p-6 md:p-8 border border-border">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                Local Commerce Traffic Flow
              </h1>
              <p className="text-xl text-primary font-semibold mb-1">
                {locationAnalysis ? locationAnalysis.location : businessName}
              </p>
              <p className="text-muted-foreground">
                {selectedBusiness ? 'Real-time Walk-by Potential Analysis' : 'Click on map or search to analyze locations'}
              </p>
              
              {/* Business selector */}
              <div className="mt-4 flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedBusiness(selectedBusiness === 'costa' ? null : 'costa')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedBusiness === 'costa'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Costa Coffee
                </button>
                <button
                  onClick={() => setSelectedBusiness(selectedBusiness === 'tbc' ? null : 'tbc')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedBusiness === 'tbc'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Two Boys Cafe
                </button>
                <button
                  onClick={() => setSelectedBusiness(selectedBusiness === 'all' ? null : 'all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedBusiness === 'all'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Combined
                </button>
              </div>
            </div>
            <MapPin className="w-8 h-8 text-primary hidden md:block" />
          </div>
        </div>

        {/* Search Bar and Map - Only show when no business is selected */}
        {selectedBusiness === null && (
          <>
            {/* Search Bar */}
            <Card className="p-4 border-0 shadow-none">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    type="text"
                    placeholder="Search by road name (e.g., Stillorgan Road) or coordinates (e.g., 53.3441, -6.2572)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-10 pr-10"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setSearchResults([]);
                        setSelectedLocation(null);
                        setLocationAnalysis(null);
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Button onClick={handleSearch} disabled={analyzingLocation}>
                  {analyzingLocation ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
              
              {/* Search Results Dropdown */}
              {searchResults.length > 1 && (
                <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-lg bg-card">
                  {searchResults.slice(0, 10).map((location) => (
                    <button
                      key={location.Site_ID}
                      onClick={() => handleLocationClick(location)}
                      className="w-full text-left px-4 py-2 hover:bg-muted transition-colors border-b border-border last:border-b-0"
                    >
                      <div className="font-medium text-foreground">{location.Location}</div>
                      <div className="text-sm text-muted-foreground">Site ID: {location.Site_ID}</div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Interactive Map */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-foreground">Interactive Map - Click to Analyze Location</h2>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-primary opacity-40 border-2 border-primary"></div>
                    <span>Data Coverage Area</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                    <span>Monitoring Site</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                    <span>Selected</span>
                  </div>
                </div>
              </div>
              <InteractiveMap
                center={[53.35, -6.26]}
            zoom={11}
            scatsLocations={scatsLocations}
            selectedLocation={selectedLocation}
            onMapClick={handleLocationSelect}
            onMarkerClick={handleLocationClick}
            height="600px"
          />
          
          {selectedLocation && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground">Selected: {selectedLocation.Location}</h3>
                  <p className="text-sm text-muted-foreground">Site ID: {selectedLocation.Site_ID}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedLocation.Lat.toFixed(6)}, {selectedLocation.Long.toFixed(6)}
                  </p>
                </div>
                {locationAnalysis && (
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">
                      {locationAnalysis.avgVolume > 0 ? locationAnalysis.avgVolume.toFixed(0) : 'N/A'}
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Volume</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

          {/* Location Analysis Results */}
          {locationAnalysis && (
            <Card className="p-6 border-0 shadow-none">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Traffic Analysis for {locationAnalysis.location}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Average Volume</div>
                <div className="text-2xl font-bold text-foreground">
                  {locationAnalysis.avgVolume > 0 ? locationAnalysis.avgVolume.toFixed(0) : 'N/A'}
                </div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Weighted Average</div>
                <div className="text-2xl font-bold text-foreground">
                  {locationAnalysis.weightedAvg > 0 ? locationAnalysis.weightedAvg.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Variance</div>
                <div className="text-2xl font-bold text-foreground">
                  {locationAnalysis.weightedVar > 0 ? locationAnalysis.weightedVar.toFixed(2) : 'N/A'}
                </div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Total Volume</div>
                <div className="text-2xl font-bold text-foreground">
                  {formatNumber(Math.round(locationAnalysis.totalVolume))}
                </div>
              </div>
            </div>
            
            {locationAnalysis.hourlyData.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-foreground mb-4">Hourly Traffic Volume</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={locationAnalysis.hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--grid-color))" />
                    <XAxis 
                      dataKey="hour" 
                      tickFormatter={formatHour}
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      label={{ value: 'Time (24-hour format)', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))', style: { fontSize: '12px' } }}
                    />
                    <YAxis 
                      label={{ value: 'Traffic Volume (vehicles)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', style: { fontSize: '12px' } }}
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={formatYAxisTick}
                    />
                    <Tooltip 
                      labelFormatter={(label) => `Time: ${formatHour(Number(label))}`}
                      formatter={(value: number) => [`${formatNumber(value)} vehicles`, 'Traffic Volume']}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="volume" 
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary))"
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {locationAnalysis.nearbySites.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-bold text-foreground mb-3">Nearby Monitoring Sites (within 2km)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {locationAnalysis.nearbySites.slice(0, 5).map((site) => (
                    <div key={site.Site_ID} className="p-3 bg-muted rounded-lg text-sm">
                      <div className="font-medium text-foreground">{site.Location}</div>
                      <div className="text-muted-foreground">Site ID: {site.Site_ID}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </Card>
          )}
          </>
        )}

        {/* Business-specific analysis - only show when business is selected */}
        {selectedBusiness !== null && (
          <>
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-primary/90 rounded-2xl shadow-lg p-6 text-primary-foreground transform transition-transform hover:scale-[1.02] cursor-pointer border border-primary/50">
            <Clock className="w-8 h-8 mb-3 opacity-90" />
            <div className="text-4xl font-bold mb-1">{formatHour(peakData.hour)}</div>
            <div className="text-sm opacity-90">Peak Hour</div>
            {realMetrics && (
              <div className="text-xs opacity-75 mt-1">Based on {realMetrics.hourlyData.reduce((sum, d) => sum + d.sampleCount, 0)} samples</div>
            )}
          </div>
          
          <div className="bg-primary/80 rounded-2xl shadow-lg p-6 text-primary-foreground transform transition-transform hover:scale-[1.02] cursor-pointer border border-primary/40">
            <TrendingUp className="w-8 h-8 mb-3 opacity-90" />
            <div className="text-4xl font-bold mb-1">{peakData.score.toFixed(2)}</div>
            <div className="text-sm opacity-90">Peak Score</div>
            {realMetrics && (
              <div className="text-xs opacity-75 mt-1">Walk-by potential</div>
            )}
          </div>
          
          <div className="bg-accent/90 rounded-2xl shadow-lg p-6 text-accent-foreground transform transition-transform hover:scale-[1.02] cursor-pointer border border-accent/50">
            <Users className="w-8 h-8 mb-3 opacity-90" />
            <div className="text-4xl font-bold mb-1">{formatNumber(peakData.pedestrians)}</div>
            <div className="text-sm opacity-90">Peak Footfall</div>
            {realMetrics && (
              <div className="text-xs opacity-75 mt-1">Pedestrians/hour</div>
            )}
          </div>
          
          <div className="bg-muted rounded-2xl shadow-lg p-6 text-foreground transform transition-transform hover:scale-[1.02] cursor-pointer border border-border">
            <Activity className="w-8 h-8 mb-3 opacity-70" />
            <div className="text-4xl font-bold mb-1">{stats.activityRate.toFixed(1)}%</div>
            <div className="text-sm opacity-80">Activity Rate</div>
            {realMetrics && (
              <div className="text-xs opacity-70 mt-1">Hours with high activity</div>
            )}
          </div>
            </div>

            {/* Main Chart - NO BOX */}
            <div className="py-6">
              <h2 className="text-2xl font-bold text-foreground mb-6 px-2">
                Walk-by Potential Score Throughout the Day
              </h2>
              <div className="border-t border-b border-divider py-4">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={trafficData} onClick={(e) => {
                    if (e?.activeLabel !== undefined) {
                      setSelectedHour(Number(e.activeLabel));
                    }
                  }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--grid-color))" />
                    <XAxis 
                      dataKey="hour" 
                      tickFormatter={formatHour}
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      label={{ value: 'Time (24-hour format)', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))', style: { fontSize: '12px' } }}
                    />
                    <YAxis 
                      label={{ value: 'Walk-by Score (0-25 scale)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', style: { fontSize: '12px' } }}
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      formatter={(value: number) => value.toFixed(2)}
                      labelFormatter={formatHour}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))'
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Bar 
                      dataKey="score" 
                      fill="hsl(var(--primary))" 
                      radius={[8, 8, 0, 0]}
                      cursor="pointer"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Detailed Analysis Grid - NO BOXES */}
            <div className="space-y-10">
              {/* Row 1: Pedestrian + Traffic */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Pedestrian Footfall */}
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-4 px-2">Pedestrian Footfall Pattern</h3>
                  <div className="border-t border-b border-divider py-4">
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={trafficData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--grid-color))" />
                        <XAxis 
                          dataKey="hour" 
                          tickFormatter={formatHour} 
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          label={{ value: 'Time (24-hour format)', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))', style: { fontSize: '12px' } }}
                        />
                        <YAxis 
                          label={{ value: 'Pedestrians per hour', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', style: { fontSize: '12px' } }}
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={formatYAxisTick}
                        />
                        <Tooltip 
                          labelFormatter={(label) => `Time: ${formatHour(Number(label))}`}
                          formatter={(value: number) => [`${formatNumber(value)} pedestrians`, 'Pedestrians']}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--foreground))'
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="pedestrians" 
                          stroke="hsl(var(--accent))" 
                          fill="hsl(var(--accent))"
                          fillOpacity={0.3}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Traffic Volume */}
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-4 px-2">Traffic Volume Pattern</h3>
                  <div className="border-t border-b border-divider py-4">
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={trafficData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--grid-color))" />
                        <XAxis 
                          dataKey="hour" 
                          tickFormatter={formatHour} 
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          label={{ value: 'Time (24-hour format)', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))', style: { fontSize: '12px' } }}
                        />
                        <YAxis 
                          label={{ value: 'Vehicle Traffic Volume', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', style: { fontSize: '12px' } }}
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={formatYAxisTick}
                        />
                        <Tooltip 
                          labelFormatter={(label) => `Time: ${formatHour(Number(label))}`}
                          formatter={(value: number) => [`${formatNumber(value)} vehicles`, 'Traffic Volume']}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--foreground))'
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="traffic" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={3}
                          dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Row 2: Activity + Selected Hour Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Activity Levels */}
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-4 px-2">Activity Levels (Audio)</h3>
                  <div className="border-t border-b border-divider py-4 mb-4">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={trafficData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--grid-color))" />
                        <XAxis 
                          dataKey="hour" 
                          tickFormatter={formatHour} 
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          label={{ value: 'Time (24-hour format)', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))', style: { fontSize: '12px' } }}
                        />
                        <YAxis 
                          label={{ value: 'Audio Activity Level (dB)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', style: { fontSize: '12px' } }}
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <Tooltip 
                          labelFormatter={(label) => `Time: ${formatHour(Number(label))}`}
                          formatter={(value: number) => [`${value.toFixed(1)} dB`, 'Activity Level']}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--foreground))'
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Bar dataKey="activity" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="p-3 bg-accent/10 border-2 border-accent rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-foreground">Audio levels above -50 dB indicate busy periods</p>
                  </div>
                </div>

                {/* Selected Hour Details - KEEP BOX */}
                <div className="bg-card rounded-2xl shadow-2xl p-6 md:p-8 border border-border">
                  <h3 className="text-xl font-bold text-foreground mb-4">Selected Hour Details</h3>
                  <div className="text-center mb-6">
                    <div className="text-5xl font-bold text-primary mb-2">{formatHour(selectedData.hour)}</div>
                    <p className="text-sm text-muted-foreground">Click any bar in the main chart</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <span className="text-foreground font-medium">Walk-by Score</span>
                      <span className="text-2xl font-bold text-primary">{selectedData.score.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <span className="text-foreground font-medium">Pedestrians</span>
                      <span className="text-2xl font-bold text-accent">{formatNumber(selectedData.pedestrians)}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <span className="text-foreground font-medium">Vehicle Traffic</span>
                      <span className="text-2xl font-bold text-primary">{formatNumber(selectedData.traffic)}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <span className="text-foreground font-medium">Activity Level</span>
                      <span className="text-2xl font-bold text-accent">{selectedData.activity} dB</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Business Recommendations - KEEP BOXED */}
            <div className="bg-card rounded-2xl shadow-2xl p-6 md:p-8 border border-border">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-foreground">Business Recommendations</h2>
                {loadingRecommendations && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating AI insights...</span>
                  </div>
                )}
              </div>
              {realMetrics && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {peakWindow && (
                    <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-primary font-semibold">Peak Window</p>
                      <h3 className="text-xl font-bold text-foreground mt-1">
                        {formatHour(peakWindow.start)}–{formatHour(peakWindow.end)}
                      </h3>
                      <p className="text-sm text-muted-foreground">≈ {displayValue(peakWindow.avgPed)} pedestrians/hr</p>
                      <p className="text-xs text-muted-foreground mb-2">Score {peakWindow.avgScore.toFixed(1)}</p>
                      <ResponsiveContainer width="100%" height={60}>
                        <LineChart data={sparklineData.filter(d => {
                          const hour = parseInt(d.hourLabel.slice(0,2), 10);
                          return hour >= Math.max(0, peakWindow.start - 2) && hour <= Math.min(23, peakWindow.end + 2);
                        })}>
                          <XAxis dataKey="hourLabel" hide />
                          <YAxis hide />
                          <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {scatsSummary && (
                    <div className="p-4 rounded-xl border border-accent/30 bg-accent/5 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-accent font-semibold">SCATS Potential</p>
                      <h3 className="text-xl font-bold text-foreground mt-1">
                        {displayValue(locationPotential)} est. potential
                      </h3>
                      <p className="text-sm text-muted-foreground">Site {scatsSummary.siteId}</p>
                      <p className="text-xs text-muted-foreground truncate">{scatsSummary.location}</p>
                    </div>
                  )}
                  {lowWindow && (
                    <div className="p-4 rounded-xl border border-muted bg-muted/50 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Low Activity</p>
                      <h3 className="text-xl font-bold text-foreground mt-1">
                        {formatHour(lowWindow.start)}–{formatHour(lowWindow.end)}
                      </h3>
                      <p className="text-sm text-muted-foreground">≈ {displayValue(lowWindow.avgPed)} passers-by/hr</p>
                      <p className="text-xs text-muted-foreground">Best window for promos & prep</p>
                    </div>
                  )}
                </div>
              )}

              {realMetrics && sparklineData.length > 0 && (
                <div className="bg-muted/40 border border-border rounded-xl p-4 mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Walk-by Potential Curve</p>
                      <p className="text-xs text-muted-foreground">Score + footfall snapshot (24h)</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Peak {formatHour(peakData.hour)} · Score {peakData.score.toFixed(1)}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={sparklineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--grid-color))" />
                      <XAxis 
                        dataKey="hourLabel" 
                        stroke="hsl(var(--muted-foreground))" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        label={{ value: 'Time (24h)', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))', style: { fontSize: '10px' } }}
                      />
                      <YAxis 
                        label={{ value: 'Score', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', style: { fontSize: '10px' } }}
                        stroke="hsl(var(--muted-foreground))" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickFormatter={(value) => value.toFixed(1)}
                      />
                      <YAxis 
                        yAxisId="1" 
                        orientation="right" 
                        label={{ value: 'Pedestrians', angle: 90, position: 'insideRight', fill: 'hsl(var(--muted-foreground))', style: { fontSize: '10px' } }}
                        stroke="hsl(var(--muted-foreground))" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                        tickFormatter={formatYAxisTick}
                      />
                      <Tooltip
                        labelFormatter={(label) => `Time: ${label}`}
                        formatter={(value: number, name: string) => {
                          if (name === 'score') return [`${value.toFixed(2)}`, 'Walk-by Score'];
                          if (name === 'pedestrians') return [`${formatNumber(value)}`, 'Pedestrians'];
                          return [value, name];
                        }}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          color: 'hsl(var(--foreground))'
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.25}
                        strokeWidth={3}
                      />
                      <Line
                        type="monotone"
                        dataKey="pedestrians"
                        yAxisId="1"
                        stroke="hsl(var(--accent))"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Parsed Recommendations - Visual Boxes */}
              {parsedRecommendations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {parsedRecommendations.map((rec, idx) => {
                    const getColorClasses = (color: string) => {
                      // Map all colors to 3-color palette: primary, accent, muted
                      const colorMap: Record<string, string> = {
                        'chart-green': 'primary',
                        'chart-cyan': 'accent',
                        'chart-orange': 'accent',
                        'chart-purple': 'primary',
                      };
                      const mappedColor = colorMap[color] || color;
                      
                      const colors: Record<string, { bg: string; border: string; text: string }> = {
                        'primary': { bg: 'bg-primary/10', border: 'border-primary/30', text: 'text-primary' },
                        'accent': { bg: 'bg-accent/10', border: 'border-accent/30', text: 'text-accent' },
                        'low': { bg: 'bg-muted/50', border: 'border-muted', text: 'text-muted-foreground' },
                        'activity': { bg: 'bg-accent/10', border: 'border-accent/30', text: 'text-accent' },
                        'busy': { bg: 'bg-primary/10', border: 'border-primary/30', text: 'text-primary' },
                        'peak': { bg: 'bg-primary/10', border: 'border-primary/30', text: 'text-primary' },
                      };
                      return colors[mappedColor] || colors['primary'];
                    };
                    
                    const colorClasses = getColorClasses(rec.color);
                    
                    return (
                      <div
                        key={idx}
                        className={`p-5 rounded-xl border-2 ${colorClasses.border} ${colorClasses.bg} shadow-lg`}
                      >
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-4">
                          <div className="flex-1">
                            <h3 className="font-bold text-foreground text-lg">{rec.title}</h3>
                            {rec.period && (
                              <p className="text-sm text-muted-foreground">{rec.period}</p>
                            )}
                          </div>
                        </div>

                        {/* Metrics Grid */}
                        {rec.metrics.length > 0 && (
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            {rec.metrics.map((metric, mIdx) => {
                              const displayVal = typeof metric.value === 'number' && metric.value <= 0
                                ? '—'
                                : `${typeof metric.value === 'number' ? formatNumber(metric.value) : metric.value}${metric.unit || ''}`;
                              
                              return (
                                <div
                                  key={mIdx}
                                  className="bg-background/50 rounded-lg p-3 border border-border"
                                >
                                  <p className="text-xs text-muted-foreground mb-1">{metric.label}</p>
                                  <p className="text-lg font-bold text-foreground">{displayVal}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Actions */}
                        {rec.actions.length > 0 && (
                          <div className="space-y-2">
                            {rec.actions.slice(0, 3).map((action, aIdx) => (
                              <div
                                key={aIdx}
                                className="bg-background/30 rounded-lg p-2.5 text-sm text-foreground"
                              >
                                {action}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Peak Opportunity Box */}
                  <div className="p-5 rounded-xl border-2 border-primary/30 bg-primary/5 shadow-lg">
                    <div className="flex items-center gap-2 mb-4">
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Peak Opportunity</h3>
                        <p className="text-sm text-muted-foreground">{formatHour(peakData.hour)}-{formatHour(peakData.hour + 1)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-background/50 rounded-lg p-3 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Score</p>
                        <p className="text-lg font-bold text-foreground">{peakData.score.toFixed(1)}</p>
                      </div>
                      <div className="bg-background/50 rounded-lg p-3 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Pedestrians</p>
                        <p className="text-lg font-bold text-foreground">{displayValue(peakData.pedestrians)}/hr</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-background/30 rounded-lg p-2.5 text-sm text-foreground">
                        Increase staffing 30 min before peak
                      </div>
                      <div className="bg-background/30 rounded-lg p-2.5 text-sm text-foreground">
                        Deploy outdoor signage at {formatHour(Math.max(0, peakData.hour - 1))}:00
                      </div>
                    </div>
                  </div>

                  {/* Low Traffic Box */}
                  {lowWindow && (
                    <div className="p-5 rounded-xl border-2 border-muted bg-muted/50 shadow-lg">
                      <div className="flex items-center gap-2 mb-4">
                        <div>
                          <h3 className="font-bold text-foreground text-lg">Low Activity</h3>
                          <p className="text-sm text-muted-foreground">{formatHour(lowWindow.start)}-{formatHour(lowWindow.end)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-background/50 rounded-lg p-3 border border-border">
                          <p className="text-xs text-muted-foreground mb-1">Pedestrians</p>
                          <p className="text-lg font-bold text-foreground">{displayValue(lowWindow.avgPed)}/hr</p>
                        </div>
                        <div className="bg-background/50 rounded-lg p-3 border border-border">
                          <p className="text-xs text-muted-foreground mb-1">Duration</p>
                          <p className="text-lg font-bold text-foreground">{lowWindow.end - lowWindow.start + 1} hrs</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="bg-background/30 rounded-lg p-2.5 text-sm text-foreground">
                          Reduce to skeleton staff
                        </div>
                        <div className="bg-background/30 rounded-lg p-2.5 text-sm text-foreground">
                          Run promotions & prep work
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Conversion Strategy Box */}
                  <div className="p-5 rounded-xl border-2 border-primary bg-primary/10 shadow-lg">
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="font-bold text-foreground text-lg">Conversion Strategy</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-background/50 rounded-lg p-3 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Target</p>
                        <p className="text-lg font-bold text-foreground">5-10%</p>
                      </div>
                      <div className="bg-background/50 rounded-lg p-3 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Focus</p>
                        <p className="text-lg font-bold text-foreground">Peak hrs</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-background/30 rounded-lg p-2.5 text-sm text-foreground">
                        Eye-catching signage & displays
                      </div>
                      <div className="bg-background/30 rounded-lg p-2.5 text-sm text-foreground">
                        Staff visibility during peaks
                      </div>
                    </div>
                  </div>

                  {/* Monitoring Box */}
                  <div className="p-5 rounded-xl border-2 border-accent/30 bg-accent/5 shadow-lg">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-2xl">🔄</span>
                      <h3 className="font-bold text-foreground text-lg">Monitoring</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-background/50 rounded-lg p-3 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Track</p>
                        <p className="text-lg font-bold text-foreground">Daily</p>
                      </div>
                      <div className="bg-background/50 rounded-lg p-3 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Compare</p>
                        <p className="text-lg font-bold text-foreground">Weekdays</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="bg-background/30 rounded-lg p-2.5 text-sm text-foreground">
                        Track conversion rates
                      </div>
                      <div className="bg-background/30 rounded-lg p-2.5 text-sm text-foreground">
                        Correlate with sales data
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
