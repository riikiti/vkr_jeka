import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import HashPage from './pages/HashPage';
import DifferentialPage from './pages/DifferentialPage';
import SATPage from './pages/SATPage';
import ExperimentPage from './pages/ExperimentPage';
import BatchPage from './pages/BatchPage';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-slate-950 text-slate-200">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 min-w-0 p-3 sm:p-4 md:p-6 overflow-auto">
          {/* Mobile header */}
          <div className="md:hidden flex items-center gap-3 mb-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300"
              aria-label="Открыть меню"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-cyan-400">DiffSAT</h1>
          </div>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/hash" element={<HashPage />} />
            <Route path="/differential" element={<DifferentialPage />} />
            <Route path="/sat" element={<SATPage />} />
            <Route path="/experiment" element={<ExperimentPage />} />
            <Route path="/batch" element={<BatchPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
