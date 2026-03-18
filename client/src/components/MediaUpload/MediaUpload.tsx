import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../api/client';
import { Upload, Marker, Group } from '../../types';
import './MediaUpload.css';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaUpload() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [markerId, setMarkerId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [uRes, mRes, gRes] = await Promise.all([
        apiClient.get<Upload[]>('/uploads'),
        apiClient.get<Marker[]>('/markers'),
        apiClient.get<Group[]>('/groups'),
      ]);
      setUploads(uRes.data);
      setMarkers(mRes.data);
      setGroups(gRes.data);
    } catch (err) {
      console.error('Failed to fetch data', err);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (markerId) formData.append('markerId', markerId);
      if (groupId) formData.append('groupId', groupId);
      await apiClient.post('/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFile(null);
      setMarkerId('');
      setGroupId('');
      (document.getElementById('file-input') as HTMLInputElement).value = '';
      await fetchAll();
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/uploads/${id}`);
      setUploads(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      console.error('Failed to delete', err);
    }
  };

  return (
    <div className="page-container">
      <h2>📷 Media Upload</h2>
      <div className="card upload-form-card">
        <h3>Upload Photo or Video</h3>
        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label>File (image or video)</label>
            <input
              id="file-input"
              type="file"
              accept="image/*,video/*"
              onChange={e => setFile(e.target.files?.[0] || null)}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Link to Marker (optional)</label>
              <select value={markerId} onChange={e => setMarkerId(e.target.value)}>
                <option value="">None</option>
                {markers.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Link to Group (optional)</label>
              <select value={groupId} onChange={e => setGroupId(e.target.value)}>
                <option value="">None</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading || !file}>
            {loading ? 'Uploading...' : '⬆️ Upload'}
          </button>
        </form>
      </div>

      <h3>Uploaded Media ({uploads.length})</h3>
      {uploads.length === 0 && <p className="empty-text">No uploads yet.</p>}
      <div className="media-gallery">
        {uploads.map(upload => (
          <div key={upload.id} className="media-card card">
            {upload.mimetype.startsWith('image/') ? (
              <img
                src={`/api/uploads/file/${upload.filename}`}
                alt={upload.originalname}
                className="media-preview"
              />
            ) : upload.mimetype.startsWith('video/') ? (
              <video
                src={`/api/uploads/file/${upload.filename}`}
                controls
                className="media-preview"
              />
            ) : (
              <div className="media-placeholder">📁</div>
            )}
            <div className="media-info">
              <p className="media-name" title={upload.originalname}>{upload.originalname}</p>
              <p className="media-meta">{formatSize(upload.size)} · {new Date(upload.uploadedAt).toLocaleDateString()}</p>
              {upload.markerId && <span className="ref-badge">📍 Marker</span>}
              {upload.groupId && <span className="ref-badge">👥 Group</span>}
            </div>
            <button className="btn-danger btn-sm" onClick={() => handleDelete(upload.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
