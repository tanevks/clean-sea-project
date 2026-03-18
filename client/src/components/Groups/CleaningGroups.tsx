import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../api/client';
import { Group } from '../../types';
import './CleaningGroups.css';

const STATUS_LABELS: Record<string, string> = {
  planned: '🔵 Planned',
  active: '🟢 Active',
  completed: '⚫ Completed',
};

export default function CleaningGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', location: '', meetingDate: '', organizer: '' });
  const [loading, setLoading] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await apiClient.get<Group[]>('/groups');
      setGroups(res.data);
    } catch (err) {
      console.error('Failed to fetch groups', err);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post('/groups', form);
      setForm({ name: '', description: '', location: '', meetingDate: '', organizer: '' });
      setShowForm(false);
      await fetchGroups();
    } catch (err) {
      console.error('Failed to create group', err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (id: string) => {
    try {
      await apiClient.put(`/groups/${id}`, { action: 'join' });
      await fetchGroups();
    } catch (err) {
      console.error('Failed to join group', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/groups/${id}`);
      await fetchGroups();
    } catch (err) {
      console.error('Failed to delete group', err);
    }
  };

  const filtered = filter === 'all' ? groups : groups.filter(g => g.status === filter);

  return (
    <div className="page-container">
      <div className="groups-header">
        <h2>👥 Cleaning Groups</h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Create Group'}
        </button>
      </div>

      {showForm && (
        <div className="card create-form">
          <h3>Create Cleaning Group</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Group Name</label>
                <input type="text" placeholder="e.g. Black Sea Cleaners" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Organizer</label>
                <input type="text" placeholder="Your name" value={form.organizer} onChange={e => setForm({ ...form, organizer: e.target.value })} required />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea rows={2} placeholder="Describe the cleanup effort..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Location</label>
                <input type="text" placeholder="e.g. Varna Beach" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Meeting Date</label>
                <input type="datetime-local" value={form.meetingDate} onChange={e => setForm({ ...form, meetingDate: e.target.value })} required />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        </div>
      )}

      <div className="filter-bar">
        {['all', 'planned', 'active', 'completed'].map(s => (
          <button
            key={s}
            className={`filter-btn ${filter === s ? 'active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? '🌊 All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 && <p className="empty-text">No groups found.</p>}
      <div className="groups-grid">
        {filtered.map(group => (
          <div key={group.id} className="group-card card">
            <div className="group-card-header">
              <h3>{group.name}</h3>
              <span className={`status-badge status-${group.status}`}>{STATUS_LABELS[group.status]}</span>
            </div>
            <p className="group-description">{group.description}</p>
            <div className="group-meta">
              <span>📍 {group.location}</span>
              <span>📅 {new Date(group.meetingDate).toLocaleString()}</span>
              <span>👤 {group.organizer}</span>
              <span>👥 {group.memberCount} members</span>
            </div>
            <div className="group-actions">
              <button className="btn-primary" onClick={() => handleJoin(group.id)}>Join</button>
              <button className="btn-danger btn-sm" onClick={() => handleDelete(group.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
