import React, { useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, LayersControl, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { UploadCloud, Info, X, Map as MapIcon, Layers } from 'lucide-react';
import SOSI from 'sosijs';

// Fix for Leaflet default icon issue in React
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const { BaseLayer } = LayersControl;

// Helper to generate a color from a string
function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
}

// Component to auto-zoom to GeoJSON bounds
function FitBounds({ data }: { data: any }) {
  const map = useMap();
  React.useEffect(() => {
    if (data) {
      const layer = L.geoJSON(data);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [data, map]);
  return null;
}

interface SosiLayer {
  id: string;
  name: string;
  data: any;
}

export default function App() {
  const [layers, setLayers] = useState<SosiLayer[]>([]);
  const [latestBoundsData, setLatestBoundsData] = useState<any | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<any | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFiles = async (files: FileList | File[]) => {
    setIsLoading(true);
    setError(null);
    
    const newLayers: SosiLayer[] = [];
    let lastGeojson = null;

    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.sos')) {
        setError(prev => prev ? `${prev}\nInvalid file: ${file.name}` : `Invalid file: ${file.name}`);
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Parse SOSI file
        const parser = new SOSI.Parser();
        const sosiData = parser.parse(buffer);
        
        // Transform to WGS84 (EPSG:4326) for Leaflet
        sosiData.transform('EPSG:4326');
        
        // Convert to GeoJSON
        const geojson = sosiData.dumps('geojson');
        
        if (!geojson || !geojson.features || geojson.features.length === 0) {
          throw new Error('No features found or could not parse the file.');
        }

        newLayers.push({
          id: Math.random().toString(36).substring(2, 9),
          name: file.name,
          data: geojson
        });
        lastGeojson = geojson;
      } catch (err: any) {
        console.error(err);
        setError(prev => prev ? `${prev}\nFailed to parse ${file.name}: ${err.message}` : `Failed to parse ${file.name}: ${err.message}`);
      }
    }

    if (newLayers.length > 0) {
      setLayers(prev => [...prev, ...newLayers]);
      if (lastGeojson) {
        setLatestBoundsData(lastGeojson);
      }
    }
    
    setIsLoading(false);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const removeLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    setSelectedFeature(null);
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    layer.on({
      click: () => {
        setSelectedFeature(feature);
      }
    });
  };

  // GeoJSON styling based on properties
  const getFeatureStyle = (feature: any) => {
    const props = feature.properties || {};
    // SOSI files typically use OBJTYPE or ..OBJTYPE to classify features
    const sosiCode = props.OBJTYPE || props['..OBJTYPE'] || props.objtype || Object.values(props)[0] || 'default';
    const color = stringToColor(String(sosiCode));
    
    return {
      color: color,
      weight: 2,
      opacity: 0.8,
      fillColor: color,
      fillOpacity: 0.4
    };
  };

  return (
    <div className="h-screen w-full relative overflow-hidden font-sans" style={{ backgroundColor: '#B7DC8F' }}>
      
      {/* Map Area */}
      <div className="absolute inset-0 z-0">
        <MapContainer 
          center={[65.0, 15.0]} 
          zoom={5} 
          style={{ height: '100%', width: '100%', backgroundColor: '#B7DC8F' }}
          zoomControl={false}
        >
          <LayersControl position="topright">
            <BaseLayer checked name="OpenStreetMap">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </BaseLayer>
            <BaseLayer name="Google Maps (Roadmap)">
              <TileLayer
                attribution='&copy; Google'
                url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              />
            </BaseLayer>
            <BaseLayer name="Google Maps (Satellite)">
              <TileLayer
                attribution='&copy; Google'
                url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
              />
            </BaseLayer>
          </LayersControl>

          {/* Add Zoom Control manually to position it bottom right */}
          <div className="leaflet-bottom leaflet-right">
            <div className="leaflet-control-zoom leaflet-bar leaflet-control">
              <a className="leaflet-control-zoom-in" href="#" title="Zoom in" role="button" aria-label="Zoom in">+</a>
              <a className="leaflet-control-zoom-out" href="#" title="Zoom out" role="button" aria-label="Zoom out">&#x2212;</a>
            </div>
          </div>

          {layers.map(layer => (
            <GeoJSON 
              key={layer.id}
              data={layer.data} 
              style={getFeatureStyle}
              onEachFeature={onEachFeature}
            />
          ))}
          <FitBounds data={latestBoundsData} />
        </MapContainer>
      </div>

      {/* Floating Overlay */}
      <div className="absolute top-4 left-4 bottom-4 w-96 flex flex-col rounded-2xl z-[1000] shadow-2xl border border-black/10 overflow-hidden" style={{ backgroundColor: '#B7DC8F' }}>
        <div className="p-6 border-b border-black/10">
          {/* Asplan Viak Logo */}
          <div className="mb-6">
            <svg viewBox="0 0 120 120" className="h-16 w-auto">
              <g transform="translate(0, 15)" stroke="#000" strokeWidth="18" strokeLinecap="round">
                <line x1="10" y1="75" x2="40" y2="5" />
                <line x1="55" y1="75" x2="70" y2="40" />
                <line x1="110" y1="75" x2="80" y2="5" />
              </g>
              
              <text x="60" y="115" fontFamily="sans-serif" fontSize="14" fontWeight="bold" fill="#000" textAnchor="middle" letterSpacing="1">BETA-appz</text>
            </svg>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <MapIcon className="w-6 h-6 text-slate-800" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Sosi kartvisning</h1>
          </div>
          <p className="text-sm text-slate-700">
            Visualize Norwegian SOSI (.sos) files interactively.
          </p>
        </div>

        {/* Drop Zone */}
        <div className="p-6 border-b border-black/10">
          <div 
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-200 ease-in-out cursor-pointer
              ${isDragging ? 'border-blue-600 bg-blue-600/10' : 'border-black/20 hover:border-black/40 hover:bg-black/5'}
              ${isLoading ? 'opacity-50 pointer-events-none' : ''}
            `}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <input 
              id="file-upload" 
              type="file" 
              accept=".sos" 
              multiple
              className="hidden" 
              onChange={handleFileInput}
            />
            <UploadCloud className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-blue-600' : 'text-slate-600'}`} />
            <p className="text-sm font-medium text-slate-800 mb-1">
              {isLoading ? 'Parsing files...' : 'Click or drag .sos files here'}
            </p>
            <p className="text-xs text-slate-600">You can drop multiple files at once</p>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-200 rounded-lg text-red-800 text-sm whitespace-pre-line">
              {error}
            </div>
          )}
        </div>

        {/* Loaded Files List */}
        {layers.length > 0 && (
          <div className="p-4 border-b border-black/10 max-h-40 overflow-y-auto custom-scrollbar flex-shrink-0 bg-black/5">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Loaded Files ({layers.length})</h3>
              <button 
                onClick={() => { setLayers([]); setLatestBoundsData(null); setSelectedFeature(null); }} 
                className="text-xs text-red-600 hover:text-red-800 transition-colors"
              >
                Clear All
              </button>
            </div>
            <ul className="space-y-1">
              {layers.map(layer => (
                <li key={layer.id} className="text-sm text-slate-800 flex justify-between items-center bg-white/40 px-3 py-2 rounded-md border border-black/5">
                  <span className="truncate pr-2" title={layer.name}>{layer.name}</span>
                  <button 
                    onClick={() => removeLayer(layer.id)} 
                    className="text-slate-500 hover:text-red-600 transition-colors p-1"
                    title="Remove file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Attribute Info Panel */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Attribute Data</h2>
          </div>
          
          {selectedFeature ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-black/10">
                <span className="text-xs font-medium text-slate-600">Feature Type</span>
                <span className="text-sm text-slate-800 bg-black/5 px-2 py-1 rounded">{selectedFeature.geometry.type}</span>
              </div>
              
              {Object.keys(selectedFeature.properties || {}).length > 0 ? (
                <div className="grid grid-cols-1 gap-2 mt-4">
                  {Object.entries(selectedFeature.properties).map(([key, value]) => (
                    <div key={key} className="bg-white/40 rounded-lg p-3 border border-black/5">
                      <div className="text-xs text-slate-600 mb-1 font-mono">{key}</div>
                      <div className="text-sm text-slate-900 break-words">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600 italic">No attributes found for this feature.</p>
              )}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center border border-dashed border-black/20 rounded-xl">
              <p className="text-sm text-slate-600 text-center px-4">
                Click on a feature on the map to view its attributes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
