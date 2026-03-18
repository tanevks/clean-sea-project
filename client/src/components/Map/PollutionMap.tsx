import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import apiClient from '../../api/client';
import { Marker } from '../../types';
import './PollutionMap.css';

const SEVERITY_COLORS: Record<string, string> = {
  low: '#4caf50',
  medium: '#ff9800',
  high: '#f44336',
  critical: '#7b1fa2',
};

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function PollutionMap() {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [clickedPos, setClickedPos] = useState<{ lat: number; lng: number } | null>(null);
  const [form, setForm] = useState({ title: '', description: '', severity: 'low' as Marker['severity'] });
  const [loading, setLoading] = useState(false);

  const fetchMarkers = useCallback(async () => {
    try {
      const res = await apiClient.get<Marker[]>('/markers');
      setMarkers(res.data);
    } catch (err) {
      console.error('Failed to fetch markers', err);
    }
  }, []);

  useEffect(() => { fetchMarkers(); }, [fetchMarkers]);

  const handleMapClick = (lat: number, lng: number) => {
    setClickedPos({ lat, lng });
    setForm({ title: '', description: '', severity: 'low' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clickedPos) return;
    setLoading(true);
    try {
      await apiClient.post('/markers', { ...form, lat: clickedPos.lat, lng: clickedPos.lng });
      setClickedPos(null);
      await fetchMarkers();
    } catch (err) {
      console.error('Failed to create marker', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/markers/${id}`);
      await fetchMarkers();
    } catch (err) {
      console.error('Failed to delete marker', err);
    }
  };

  return (
    <div className="map-page">
      <div className="map-header">
        <h2>🗺️ Pollution Map</h2>
        <p>Click on the map to report a polluted area</p>
      </div>
      <div className="map-wrapper">
        <MapContainer center={[42.7, 27.9]} zoom={8} className="leaflet-map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onMapClick={handleMapClick} />
          {markers.map(marker => (
            <CircleMarker
              key={marker.id}
              center={[marker.lat, marker.lng]}
              radius={12}
              pathOptions={{ color: SEVERITY_COLORS[marker.severity], fillColor: SEVERITY_COLORS[marker.severity], fillOpacity: 0.7 }}
            >
              <Popup>
                <div className="popup-content">
                  <h3>{marker.title}</h3>
                  <p>{marker.description}</p>
                  <span className={`severity-badge severity-${marker.severity}`}>{marker.severity.toUpperCase()}</span>
                  <p className="popup-date">{new Date(marker.createdAt).toLocaleDateString()}</p>
                  <button className="btn-danger" onClick={() => handleDelete(marker.id)}>Delete</button>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
        <div className="map-legend">
          <h4>Severity Legend</h4>
          {Object.entries(SEVERITY_COLORS).map(([sev, color]) => (
            <div key={sev} className="legend-item">
              <span className="legend-dot" style={{ background: color }}></span>
              <span>{sev.charAt(0).toUpperCase() + sev.slice(1)}</span>
            </div>
          ))}
        </div>
      </div>
      {clickedPos && (
        <div className="add-form-overlay">
          <div className="add-form card">
            <h3>📍 Add Pollution Report</h3>
            <p className="coords">Lat: {clickedPos.lat.toFixed(4)}, Lng: {clickedPos.lng.toFixed(4)}</p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  placeholder="e.g. Plastic waste on beach"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  placeholder="Describe the pollution..."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  required
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Severity</label>
                <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value as Marker['severity'] })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : 'Add Report'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setClickedPos(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
