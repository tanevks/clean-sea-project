import { useEffect, useState, useRef, useCallback } from 'react';
import apiClient from '../../api/client';
import { Message, Marker } from '../../types';
import './Chat.css';

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [form, setForm] = useState({ username: '', text: '', markerRef: '' });
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await apiClient.get<Message[]>('/messages');
      setMessages(res.data.reverse());
    } catch (err) {
      console.error('Failed to fetch messages', err);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    apiClient.get<Marker[]>('/markers').then(r => setMarkers(r.data)).catch(() => {});
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.text.trim()) return;
    setLoading(true);
    try {
      await apiClient.post('/messages', {
        username: form.username,
        text: form.text,
        markerRef: form.markerRef || undefined,
      });
      setForm(prev => ({ ...prev, text: '', markerRef: '' }));
      await fetchMessages();
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/messages/${id}`);
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  };

  return (
    <div className="page-container">
      <h2>💬 Pollution Chat</h2>
      <p className="subtitle">Share pollution reports and coordinate cleanup efforts</p>
      <div className="chat-container card">
        <div className="messages-list">
          {messages.length === 0 && (
            <div className="empty-state">No messages yet. Be the first to report!</div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className="message-item">
              <div className="message-header">
                <span className="message-username">{msg.username}</span>
                <span className="message-time">{new Date(msg.createdAt).toLocaleString()}</span>
                <button className="btn-danger btn-sm" onClick={() => handleDelete(msg.id)}>✕</button>
              </div>
              {msg.markerRef && (
                <span className="marker-ref-badge">📍 Related to marker</span>
              )}
              <p className="message-text">{msg.text}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <form className="chat-form" onSubmit={handleSubmit}>
          <div className="chat-inputs">
            <input
              type="text"
              placeholder="Your name"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              className="username-input"
              required
            />
            <select
              value={form.markerRef}
              onChange={e => setForm({ ...form, markerRef: e.target.value })}
              className="marker-select"
            >
              <option value="">No marker reference</option>
              {markers.map(m => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </div>
          <div className="chat-message-row">
            <textarea
              placeholder="Share a pollution report or update..."
              value={form.text}
              onChange={e => setForm({ ...form, text: e.target.value })}
              rows={2}
              required
            />
            <button type="submit" className="btn-primary send-btn" disabled={loading}>
              {loading ? '...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
