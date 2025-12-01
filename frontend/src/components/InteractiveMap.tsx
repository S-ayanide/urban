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
  clickedLocation?: { lat: number; lon: number } | null;
}

export default function InteractiveMap({
  center,
  zoom = 11,
  scatsLocations,
  selectedLocation,
  onMapClick,
  onMarkerClick,
  height = '400px',
  clickedLocation,
}: InteractiveMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hasInitialized = useRef(false);

  const dublinCenter: [number, number] = [-6.2603, 53.3498];
  const initialCenter: [number, number] = [-6.256438447082149, 53.344377563958645];
  
  const mapCenter = scatsLocations.length > 0
    ? (() => {
        const lats = scatsLocations.map(loc => loc.Lat);
        const lons = scatsLocations.map(loc => loc.Long);
        const avgLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const avgLon = (Math.min(...lons) + Math.max(...lons)) / 2;
        if (avgLat > 50 && avgLat < 55 && avgLon > -8 && avgLon < -5) {
          return [avgLat, avgLon] as [number, number];
        }
        return dublinCenter;
      })()
    : (center && center[0] > 50 && center[0] < 55 && center[1] > -8 && center[1] < -5)
      ? center
      : dublinCenter;

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.MAPBOX_ACCESS_TOKEN;
    
    if (!accessToken) {
      console.error('Mapbox access token not found. Please add VITE_MAPBOX_ACCESS_TOKEN to your .env file');
      return;
    }

    mapboxgl.accessToken = accessToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: initialCenter,
      zoom: zoom,
      attributionControl: true,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.setCenter(initialCenter);
    map.current.setZoom(zoom);

    map.current.on('load', () => {
      setMapLoaded(true);
      
      map.current!.setCenter(initialCenter);
      map.current!.setZoom(zoom);
    });

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
  }, [scatsLocations, mapLoaded, onMarkerClick, selectedLocation]);

  useEffect(() => {
    if (!map.current || !mapLoaded || !selectedLocation) return;

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
    
    const addCircle = () => {
      if (!map.current || !selectedLocation) {
        console.log('Cannot add circle: map or selectedLocation missing');
        return;
      }
      
      try {
        // Remove existing circle if it exists
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

        const layers = map.current.getStyle().layers;
        const firstSymbolLayer = layers.find((layer: any) => layer.type === 'symbol');
        const beforeId = firstSymbolLayer ? firstSymbolLayer.id : undefined;
        const lat = selectedLocation.Lat;
        const latRad = (lat * Math.PI) / 180;
        const earthCircumference = 40075017;
        const meters = 500;
        
        const radiusAtZoom10 = (meters * 256 * Math.pow(2, 10)) / (earthCircumference * Math.cos(latRad));
        const radiusAtZoom15 = (meters * 256 * Math.pow(2, 15)) / (earthCircumference * Math.cos(latRad));
        const radiusAtZoom20 = (meters * 256 * Math.pow(2, 20)) / (earthCircumference * Math.cos(latRad));

        map.current.addLayer({
          id: circleId,
          type: 'circle',
          source: circleId,
          beforeId: beforeId,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, radiusAtZoom10,
              15, radiusAtZoom15,
              20, radiusAtZoom20
            ],
            'circle-color': '#ef4444',
            'circle-opacity': 0.15,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ef4444',
            'circle-stroke-opacity': 0.6,
          },
        });
        
        console.log('Selected circle added at:', selectedLocation.Long, selectedLocation.Lat);
      } catch (error) {
        console.error('Error adding selected circle:', error);
      }
    };

    const ensureCircleVisible = () => {
      setTimeout(() => {
        if (map.current && selectedLocation) {
          try {
            if (!map.current.getLayer(circleId)) {
              console.log('Circle missing, re-adding...');
              addCircle();
            } else {
              console.log('Circle exists, checking visibility...');
            }
          } catch (error) {
            console.error('Error checking circle:', error);
          }
        }
      }, 100);
    };

    if (map.current.isStyleLoaded()) {
      addCircle();
      map.current.flyTo({
        center: [selectedLocation.Long, selectedLocation.Lat],
        zoom: 14,
        duration: 1000,
      });
      ensureCircleVisible();
      map.current.once('moveend', ensureCircleVisible);
    } else {
      map.current.once('style.load', () => {
        addCircle();
        if (map.current && selectedLocation) {
          map.current.flyTo({
            center: [selectedLocation.Long, selectedLocation.Lat],
            zoom: 14,
            duration: 1000,
          });
          ensureCircleVisible();
          map.current.once('moveend', ensureCircleVisible);
        }
      });
    }

    markersRef.current.push(selectedMarker);

    return () => {
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

  useEffect(() => {
    if (!map.current || !mapLoaded || !clickedLocation) return;

    const circleId = 'clicked-circle';
    
    const addCircle = () => {
      if (!map.current || !clickedLocation) return;
      
      try {
        if (map.current.getLayer(circleId)) {
          map.current.removeLayer(circleId);
        }
        if (map.current.getSource(circleId)) {
          map.current.removeSource(circleId);
        }

        map.current.addSource(circleId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [clickedLocation.lon, clickedLocation.lat],
            },
          },
        });

        const layers = map.current.getStyle().layers;
        const firstSymbolLayer = layers.find((layer: any) => layer.type === 'symbol');
        const beforeId = firstSymbolLayer ? firstSymbolLayer.id : undefined;
        const lat = clickedLocation.lat;
        const latRad = (lat * Math.PI) / 180;
        const earthCircumference = 40075017;
        const meters = 500;
        
        const radiusAtZoom10 = (meters * 256 * Math.pow(2, 10)) / (earthCircumference * Math.cos(latRad));
        const radiusAtZoom15 = (meters * 256 * Math.pow(2, 15)) / (earthCircumference * Math.cos(latRad));
        const radiusAtZoom20 = (meters * 256 * Math.pow(2, 20)) / (earthCircumference * Math.cos(latRad));

        map.current.addLayer({
          id: circleId,
          type: 'circle',
          source: circleId,
          beforeId: beforeId,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, radiusAtZoom10,
              15, radiusAtZoom15,
              20, radiusAtZoom20
            ],
            'circle-color': '#14b8a6',
            'circle-opacity': 0.15,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#14b8a6',
            'circle-stroke-opacity': 0.6,
          },
        });
      } catch (error) {
        console.error('Error adding clicked circle:', error);
      }
    };

    if (map.current.isStyleLoaded()) {
      addCircle();
    } else {
      map.current.once('style.load', addCircle);
    }

    return () => {
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
  }, [clickedLocation, mapLoaded]);

  return (
    <div className="w-full rounded-lg overflow-hidden border border-border" style={{ height, position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
