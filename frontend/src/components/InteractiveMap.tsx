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

  // Default to Dublin coordinates
  const dublinCenter: [number, number] = [53.3498, -6.2603];
  
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

    // Use Mapbox Streets style - always start with Dublin center
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: dublinCenter,
      zoom: zoom,
      attributionControl: true,
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);
      
      // After map loads, fit bounds to locations if available and valid
      if (scatsLocations.length > 0) {
        const validLocations = scatsLocations.filter(loc => 
          loc.Lat > 50 && loc.Lat < 55 && loc.Long > -8 && loc.Long < -5
        );
        
        if (validLocations.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          validLocations.forEach(loc => {
            bounds.extend([loc.Long, loc.Lat]);
          });
          map.current!.fitBounds(bounds, {
            padding: 50,
            maxZoom: 12,
          });
        } else {
          // If no valid locations, ensure we're centered on Dublin
          map.current!.setCenter(dublinCenter);
        }
      } else {
        // No locations, ensure Dublin center
        map.current!.setCenter(dublinCenter);
      }
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
  }, [scatsLocations, mapLoaded, onMarkerClick]);

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
    if (map.current.getSource(circleId)) {
      map.current.removeLayer(circleId);
      map.current.removeSource(circleId);
    }

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

    map.current.addLayer({
      id: circleId,
      type: 'circle',
      source: circleId,
      paint: {
        'circle-radius': 300,
        'circle-color': '#ef4444',
        'circle-opacity': 0.2,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ef4444',
        'circle-stroke-opacity': 0.8,
      },
    });

    // Zoom to selected location
    map.current.flyTo({
      center: [selectedLocation.Long, selectedLocation.Lat],
      zoom: 14,
      duration: 1000,
    });

    markersRef.current.push(selectedMarker);

    return () => {
      selectedMarker.remove();
      if (map.current?.getLayer(circleId)) {
        map.current.removeLayer(circleId);
        map.current.removeSource(circleId);
      }
    };
  }, [selectedLocation, mapLoaded]);

  return (
    <div className="w-full rounded-lg overflow-hidden border border-border" style={{ height, position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
