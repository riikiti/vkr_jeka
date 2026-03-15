import { NavLink } from 'react-router-dom';
import { Hash, FlaskConical, Cpu, Play, BarChart3, Settings, Layers } from 'lucide-react';
import InfoModal from './InfoModal';
import {
  sidebarDashboard, sidebarHash, sidebarDifferential, sidebarSAT,
  sidebarExperiment, sidebarBatch, sidebarSettings,
} from '../data/infoContent';

const links = [
  { to: '/', label: 'Дашборд', icon: BarChart3, info: sidebarDashboard },
  { to: '/hash', label: 'Хэш-функции', icon: Hash, info: sidebarHash },
  { to: '/differential', label: 'Дифференциальный', icon: FlaskConical, info: sidebarDifferential },
  { to: '/sat', label: 'SAT-кодирование', icon: Cpu, info: sidebarSAT },
  { to: '/experiment', label: 'Эксперимент', icon: Play, info: sidebarExperiment },
  { to: '/batch', label: 'Батч / Grid Search', icon: Layers, info: sidebarBatch },
  { to: '/settings', label: 'Настройки', icon: Settings, info: sidebarSettings },
];

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-slate-900 border-r border-slate-700 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-lg font-bold text-cyan-400">DiffSAT</h1>
        <p className="text-xs text-slate-400 mt-1">Algorithm v0.2b</p>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {links.map(({ to, label, icon: Icon, info }) => (
          <div key={to} className="flex items-center gap-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex-1 min-w-0 flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
            <div className="shrink-0">
              <InfoModal title={info.title} size="sm">
                {info.content}
              </InfoModal>
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
