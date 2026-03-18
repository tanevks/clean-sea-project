import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Layout/Navbar';
import PollutionMap from './components/Map/PollutionMap';
import Chat from './components/Chat/Chat';
import MediaUpload from './components/MediaUpload/MediaUpload';
import CleaningGroups from './components/Groups/CleaningGroups';
import Results from './components/Results/Results';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/map" replace />} />
        <Route path="/map" element={<PollutionMap />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/media" element={<MediaUpload />} />
        <Route path="/groups" element={<CleaningGroups />} />
        <Route path="/results" element={<Results />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
