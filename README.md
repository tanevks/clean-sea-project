# 🌊 Clean Sea Project

A community web application for reporting and organizing ocean and nature pollution cleanup efforts.

## Features

- 🗺️ **Interactive Pollution Map** - Mark polluted areas on a map with severity levels
- 💬 **Community Chat** - Share pollution reports and coordinate with others
- 📷 **Media Upload** - Upload photos and videos from polluted locations
- 👥 **Cleaning Groups** - Create and join cleanup events
- 📊 **Results Dashboard** - Track cleanup statistics and progress

## Tech Stack

- **Frontend**: React + TypeScript + Vite, Leaflet.js for maps
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (better-sqlite3)
- **File Uploads**: Multer

## Setup

### Prerequisites
- Node.js 18+
- npm 8+

### Installation

```bash
# Install all dependencies (root + client + server)
npm run install:all
```

### Development

```bash
# Start both frontend and backend in dev mode
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Build

```bash
npm run build
```

## Project Structure

```
clean-sea-project/
├── client/          # React frontend (Vite + TypeScript)
├── server/          # Node.js backend (Express + TypeScript)
└── package.json     # Root workspace scripts
```