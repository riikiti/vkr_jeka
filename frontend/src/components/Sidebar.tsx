import { NavLink } from 'react-router-dom';
import { Hash, FlaskConical, Cpu, Play, BarChart3, Settings } from 'lucide-react';

const links = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/hash', label: 'Hash Functions', icon: Hash },
  { to: '/differential', label: 'Differential', icon: FlaskConical },
  { to: '/sat', label: 'SAT Encoding', icon: Cpu },
  { to: '/experiment', label: 'Experiment', icon: Play },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="w-56 min-h-screen bg-slate-900 border-r border-slate-700 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-lg font-bold text-cyan-400">CryptoAnalysis</h1>
        <p className="text-xs text-slate-400 mt-1">Differential + SAT</p>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
