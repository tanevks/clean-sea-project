import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../api/client';
import { Results as ResultsType } from '../../types';
import './Results.css';

export default function Results() {
  const [data, setData] = useState<ResultsType | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<ResultsType>('/results');
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch results', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  if (!data) return <div className="page-container"><p>Loading...</p></div>;

  return (
    <div className="page-container">
      <div className="results-header">
        <h2>📊 Cleanup Results & Statistics</h2>
        <button className="btn-secondary" onClick={fetchResults} disabled={loading}>
          {loading ? 'Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card card">
          <div className="stat-icon">🗺️</div>
          <div className="stat-value">{data.totalMarkers}</div>
          <div className="stat-label">Pollution Reports</div>
        </div>
        <div className="stat-card card">
          <div className="stat-icon">👥</div>
          <div className="stat-value">{data.totalGroups}</div>
          <div className="stat-label">Cleaning Groups</div>
        </div>
        <div className="stat-card card">
          <div className="stat-icon">📷</div>
          <div className="stat-value">{data.totalUploads}</div>
          <div className="stat-label">Media Uploads</div>
        </div>
        <div className="stat-card card">
          <div className="stat-icon">💬</div>
          <div className="stat-value">{data.totalMessages}</div>
          <div className="stat-label">Chat Messages</div>
        </div>
      </div>

      <div className="breakdown-grid">
        <div className="card">
          <h3>Pollution Reports by Severity</h3>
          <div className="breakdown-list">
            <div className="breakdown-item">
              <span className="severity-dot" style={{ background: '#4caf50' }}></span>
              <span className="breakdown-label">Low</span>
              <span className="breakdown-count">{data.markersBySeverity.low}</span>
            </div>
            <div className="breakdown-item">
              <span className="severity-dot" style={{ background: '#ff9800' }}></span>
              <span className="breakdown-label">Medium</span>
              <span className="breakdown-count">{data.markersBySeverity.medium}</span>
            </div>
            <div className="breakdown-item">
              <span className="severity-dot" style={{ background: '#f44336' }}></span>
              <span className="breakdown-label">High</span>
              <span className="breakdown-count">{data.markersBySeverity.high}</span>
            </div>
            <div className="breakdown-item">
              <span className="severity-dot" style={{ background: '#7b1fa2' }}></span>
              <span className="breakdown-label">Critical</span>
              <span className="breakdown-count">{data.markersBySeverity.critical}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Cleaning Groups by Status</h3>
          <div className="breakdown-list">
            <div className="breakdown-item">
              <span className="severity-dot" style={{ background: '#1565c0' }}></span>
              <span className="breakdown-label">Planned</span>
              <span className="breakdown-count">{data.groupsByStatus.planned}</span>
            </div>
            <div className="breakdown-item">
              <span className="severity-dot" style={{ background: '#2e7d32' }}></span>
              <span className="breakdown-label">Active</span>
              <span className="breakdown-count">{data.groupsByStatus.active}</span>
            </div>
            <div className="breakdown-item">
              <span className="severity-dot" style={{ background: '#555' }}></span>
              <span className="breakdown-label">Completed</span>
              <span className="breakdown-count">{data.groupsByStatus.completed}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
