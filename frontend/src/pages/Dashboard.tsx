import { useEffect, useState } from 'react';
import { listExperiments } from '../api/experiments';
import type { ExperimentResult } from '../types';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [experiments, setExperiments] = useState<ExperimentResult[]>([]);
  const [health, setHealth] = useState<string>('checking...');
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setHealth(d.status))
      .catch(() => setHealth('offline'));

    listExperiments()
      .then(setExperiments)
      .catch(() => {});
  }, []);

  const collisions = experiments.filter(
    e => e.results && (e.results as Record<string, unknown>).success === true,
  ).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Backend Status"
          value={health}
          color={health === 'healthy' ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard title="Experiments" value={experiments.length} />
        <StatCard title="Collisions Found" value={collisions} color="text-yellow-400" />
        <StatCard
          title="Completed"
          value={experiments.filter(e => e.status === 'completed').length}
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionCard
          title="Test Hash Function"
          desc="Compute and compare hashes"
          onClick={() => navigate('/hash')}
        />
        <ActionCard
          title="SAT Encoding"
          desc="Encode hash rounds to CNF"
          onClick={() => navigate('/sat')}
        />
        <ActionCard
          title="Run Experiment"
          desc="Combined Differential+SAT attack"
          onClick={() => navigate('/experiment')}
        />
      </div>

      {/* Recent experiments table */}
      {experiments.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h2 className="text-lg font-semibold mb-3">Recent Experiments</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-left pb-2">ID</th>
                <th className="text-left pb-2">Hash</th>
                <th className="text-left pb-2">Rounds</th>
                <th className="text-left pb-2">Method</th>
                <th className="text-left pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {experiments.slice(-10).reverse().map(exp => (
                <tr key={exp.id} className="border-b border-slate-700/50">
                  <td className="py-2 font-mono text-cyan-400">{exp.id}</td>
                  <td className="py-2">{exp.config.hash_function}</td>
                  <td className="py-2">{exp.config.num_rounds}</td>
                  <td className="py-2">{exp.config.method}</td>
                  <td className="py-2">
                    <StatusBadge status={exp.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string | number; color?: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <p className="text-xs text-slate-400 uppercase tracking-wider">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-white'}`}>{value}</p>
    </div>
  );
}

function ActionCard({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-slate-800 rounded-xl p-5 border border-slate-700 text-left
                 hover:border-cyan-500/50 hover:bg-slate-800/80 transition-all cursor-pointer"
    >
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="text-sm text-slate-400 mt-1">{desc}</p>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400',
    running: 'bg-blue-500/20 text-blue-400',
    failed: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${colors[status] || 'bg-slate-600 text-slate-300'}`}>
      {status}
    </span>
  );
}
