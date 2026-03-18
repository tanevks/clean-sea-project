import { NavLink } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-brand">🌊 Clean Sea Project</div>
      <div className="navbar-links">
        <NavLink to="/map" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>🗺️ Map</NavLink>
        <NavLink to="/chat" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>💬 Chat</NavLink>
        <NavLink to="/media" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>📷 Media</NavLink>
        <NavLink to="/groups" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>👥 Groups</NavLink>
        <NavLink to="/results" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>📊 Results</NavLink>
      </div>
    </nav>
  );
}
