import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import HashPage from './pages/HashPage';
import DifferentialPage from './pages/DifferentialPage';
import SATPage from './pages/SATPage';
import ExperimentPage from './pages/ExperimentPage';
import BatchPage from './pages/BatchPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-slate-950 text-slate-200">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/hash" element={<HashPage />} />
            <Route path="/differential" element={<DifferentialPage />} />
            <Route path="/sat" element={<SATPage />} />
            <Route path="/experiment" element={<ExperimentPage />} />
            <Route path="/batch" element={<BatchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
