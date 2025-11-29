import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { SCATSLocation } from '@/lib/scatsService';

interface InteractiveMapProps {
  center: [number, number];
  zoom?: number;
  scatsLocations: SCATSLocation[];
  selectedLocation: SCATSLocation | null;
  onMapClick: (lat: number, lon: number) => void;
  onMarkerClick: (location: SCATSLocation) => void;
  height?: string;
}

export default function InteractiveMap({
  center,
  zoom = 11,
  scatsLocations,
  selectedLocation,
  onMapClick,
  onMarkerClick,
  height = '400px',
}: InteractiveMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hasInitialized = useRef(false); // Track if map has been initialized

  // Default to Dublin coordinates (Mapbox uses [longitude, latitude] format)
  const dublinCenter: [number, number] = [-6.2603, 53.3498];
  // Initial render center - specific location (Costa Coffee) - [longitude, latitude]
  const initialCenter: [number, number] = [-6.256438447082149, 53.344377563958645];
  
  // Calculate center from locations if available, otherwise use Dublin
  const mapCenter = scatsLocations.length > 0
    ? (() => {
        const lats = scatsLocations.map(loc => loc.Lat);
        const lons = scatsLocations.map(loc => loc.Long);
        // Ensure we have valid coordinates (Dublin area: lat ~53, lon ~-6)
        const avgLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const avgLon = (Math.min(...lons) + Math.max(...lons)) / 2;
        // Validate coordinates are in Dublin area
        if (avgLat > 50 && avgLat < 55 && avgLon > -8 && avgLon < -5) {
          return [avgLat, avgLon] as [number, number];
        }
        return dublinCenter;
      })()
    : (center && center[0] > 50 && center[0] < 55 && center[1] > -8 && center[1] < -5)
      ? center
      : dublinCenter;

  // Initialize map
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    // Get Mapbox access token from environment variables
    // In Vite, env vars need VITE_ prefix, but user might have MAPBOX_ACCESS_TOKEN
    const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.MAPBOX_ACCESS_TOKEN;
    
    if (!accessToken) {
      console.error('Mapbox access token not found. Please add VITE_MAPBOX_ACCESS_TOKEN to your .env file');
      return;
    }

    // Set the access token
    mapboxgl.accessToken = accessToken;

    // Use Mapbox Streets style - start with specific initial center (only on first render)
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: initialCenter, // Use specific location on initial render
      zoom: zoom,
      attributionControl: true,
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Ensure map is centered on initial location immediately after creation
    map.current.setCenter(initialCenter);
    map.current.setZoom(zoom);

    map.current.on('load', () => {
      setMapLoaded(true);
      
      // Explicitly ensure we're centered on initial location when map loads (first render only)
      // This prevents any automatic bounds fitting from moving the map
      map.current!.setCenter(initialCenter);
      map.current!.setZoom(zoom);
    });

    // Handle map clicks
    map.current.on('click', (e) => {
      onMapClick(e.lngLat.lat, e.lngLat.lng);
    });

    return () => {
      // Cleanup markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update markers when locations change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Store current center/zoom to prevent map from moving when adding markers
    const currentCenter = map.current.getCenter();
    const currentZoom = map.current.getZoom();

    // Remove existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add markers for all SCATS locations
    scatsLocations.forEach((location, index) => {
      const el = document.createElement('div');
      el.className = 'scats-marker';
      el.style.width = '20px';
      el.style.height = '20px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#3b82f6'; // Blue
      el.style.border = '2px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

      const marker = new mapboxgl.Marker(el)
        .setLngLat([location.Long, location.Lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div style="font-size: 12px;">
                <strong>Site ${location.Site_ID}</strong><br/>
                ${location.Location}<br/>
                <span style="color: #666;">${location.Lat.toFixed(6)}, ${location.Long.toFixed(6)}</span>
              </div>
            `)
        )
        .addTo(map.current!);

      el.addEventListener('click', () => {
        onMarkerClick(location);
      });

      markersRef.current.push(marker);
    });

    // Don't move the map when adding markers - let user control the view after first render
    // The initial center is only set on first render, not when markers are added
  }, [scatsLocations, mapLoaded, onMarkerClick, selectedLocation]);

  // Update selected location
  useEffect(() => {
    if (!map.current || !mapLoaded || !selectedLocation) return;

    // Remove existing selected marker
    const existingSelected = markersRef.current.find(m => 
      m.getLngLat().lng === selectedLocation.Long && 
      m.getLngLat().lat === selectedLocation.Lat
    );
    
    if (existingSelected) {
      existingSelected.remove();
      const index = markersRef.current.indexOf(existingSelected);
      if (index > -1) markersRef.current.splice(index, 1);
    }

    // Add selected marker (red, larger)
    const el = document.createElement('div');
    el.className = 'selected-marker';
    el.style.width = '30px';
    el.style.height = '30px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#ef4444'; // Red
    el.style.border = '3px solid white';
    el.style.cursor = 'pointer';
    el.style.boxShadow = '0 3px 6px rgba(0,0,0,0.4)';

    const selectedMarker = new mapboxgl.Marker(el)
      .setLngLat([selectedLocation.Long, selectedLocation.Lat])
      .setPopup(
        new mapboxgl.Popup({ offset: 25 })
          .setHTML(`
            <div style="font-size: 12px;">
              <strong>Selected: Site ${selectedLocation.Site_ID}</strong><br/>
              ${selectedLocation.Location}
            </div>
          `)
      )
      .addTo(map.current!);

    // Add circle around selected location
    const circleId = 'selected-circle';
    
    // Function to add the circle
    const addCircle = () => {
      if (!map.current || !selectedLocation) return;
      
      try {
        // Remove existing circle if it exists (layer first, then source)
        if (map.current.getLayer(circleId)) {
          map.current.removeLayer(circleId);
        }
        if (map.current.getSource(circleId)) {
          map.current.removeSource(circleId);
        }

        // Add the circle source and layer
        map.current.addSource(circleId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [selectedLocation.Long, selectedLocation.Lat],
            },
          },
        });

        // Try to add the circle layer before any existing layers to ensure visibility
        const layers = map.current.getStyle().layers;
        const firstSymbolLayer = layers.find((layer: any) => layer.type === 'symbol');
        const beforeId = firstSymbolLayer ? firstSymbolLayer.id : undefined;

        // Calculate approximate pixel radius for 500 meters at different zoom levels
        // Formula: meters * (256 * 2^zoom) / (40075017 * cos(lat))
        // For Dublin (lat ~53.35): cos(53.35°) ≈ 0.595
        const lat = selectedLocation.Lat;
        const latRad = (lat * Math.PI) / 180;
        const earthCircumference = 40075017; // meters
        const meters = 500; // Desired radius in meters
        
        const radiusAtZoom10 = (meters * 256 * Math.pow(2, 10)) / (earthCircumference * Math.cos(latRad));
        const radiusAtZoom15 = (meters * 256 * Math.pow(2, 15)) / (earthCircumference * Math.cos(latRad));
        const radiusAtZoom20 = (meters * 256 * Math.pow(2, 20)) / (earthCircumference * Math.cos(latRad));

        map.current.addLayer({
          id: circleId,
          type: 'circle',
          source: circleId,
          beforeId: beforeId, // Add before symbol layers to ensure visibility
          paint: {
            // Use zoom-based interpolation to keep radius constant in meters (500m)
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, radiusAtZoom10,
              15, radiusAtZoom15,
              20, radiusAtZoom20
            ],
            'circle-color': '#ef4444',
            'circle-opacity': 0.15, // Subtle fill opacity
            'circle-stroke-width': 2, // Thinner stroke for subtlety
            'circle-stroke-color': '#ef4444',
            'circle-stroke-opacity': 0.6, // Visible but subtle stroke opacity
          },
        });
        
        console.log('Circle added at:', selectedLocation.Long, selectedLocation.Lat);
      } catch (error) {
        console.error('Error adding circle:', error);
      }
    };

    // Add circle first (before zooming)
    // Ensure map style is loaded before adding layers
    if (map.current.isStyleLoaded()) {
      addCircle();
    } else {
      // If style not loaded yet, wait for it
      map.current.once('style.load', addCircle);
    }

    // Zoom to selected location
    map.current.flyTo({
      center: [selectedLocation.Long, selectedLocation.Lat],
      zoom: 14,
      duration: 1000,
    });

    markersRef.current.push(selectedMarker);

    return () => {
      // Cleanup: remove marker and circle when location changes or component unmounts
      selectedMarker.remove();
      if (map.current) {
        try {
          if (map.current.getLayer(circleId)) {
            map.current.removeLayer(circleId);
          }
          if (map.current.getSource(circleId)) {
            map.current.removeSource(circleId);
          }
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
    };
  }, [selectedLocation, mapLoaded]);

  return (
    <div className="w-full rounded-lg overflow-hidden border border-border" style={{ height, position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
