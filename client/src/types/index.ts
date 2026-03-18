export interface Marker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  imageUrl?: string;
}

export interface Message {
  id: string;
  username: string;
  text: string;
  markerRef?: string;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  location: string;
  meetingDate: string;
  organizer: string;
  memberCount: number;
  status: 'planned' | 'active' | 'completed';
  createdAt: string;
}

export interface Upload {
  id: string;
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
  markerId?: string;
  groupId?: string;
  uploadedAt: string;
}

export interface Results {
  totalMarkers: number;
  markersBySeverity: { low: number; medium: number; high: number; critical: number };
  totalGroups: number;
  groupsByStatus: { planned: number; active: number; completed: number };
  totalUploads: number;
  totalMessages: number;
}
