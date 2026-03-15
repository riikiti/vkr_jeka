import { useEffect, useState } from 'react';
import { listExperiments } from '../api/experiments';
import type { ExperimentResult } from '../types';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis,
} from 'recharts';
import InfoModal from '../components/InfoModal';
import { dashboardStats, dashboardActions, dashboardCharts, dashboardTable } from '../data/infoContent';

const STATUS_COLORS: Record<string, string> = {
  'Завершён':    '#4ade80',
  'Выполняется': '#60a5fa',
  'Ошибка':      '#f87171',
};

const METHOD_COLORS: Record<string, string> = {
  'Комбинированный': '#06b6d4',
  'Чистый SAT':      '#a78bfa',
  'Дифференциальный':'#fb923c',
};

const statusLabels: Record<string, string> = {
  completed: 'Завершён',
  running: 'Выполняется',
  failed: 'Ошибка',
};

const methodLabels: Record<string, string> = {
  combined:          'Комбинированный',
  pure_sat:          'Чистый SAT',
  pure_differential: 'Дифференциальный',
};

export default function Dashboard() {
  const [experiments, setExperiments] = useState<ExperimentResult[]>([]);
  const [health, setHealth] = useState<string>('checking...');
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setHealth(d.status))
      .catch(() => setHealth('недоступен'));

    listExperiments()
      .then(setExperiments)
      .catch(() => {});
  }, []);

  const collisions = experiments.filter(
    e => e.results && (e.results as Record<string, unknown>).success === true,
  ).length;

  // Данные для PieChart статусов
  const statusData = Object.entries(statusLabels)
    .map(([key, label]) => ({
      name: label,
      value: experiments.filter(e => e.status === key).length,
    }))
    .filter(d => d.value > 0);

  // Данные для BarChart методов
  const methodData = Object.entries(methodLabels)
    .map(([key, label]) => ({
      name: label,
      count: experiments.filter(e => e.config?.method === key).length,
    }))
    .filter(d => d.count > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Дашборд</h1>

      {/* Статистические карточки */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Статистика</h2>
          <InfoModal title={dashboardStats.title} size="sm">{dashboardStats.content}</InfoModal>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Статус бэкенда"
          value={health === 'healthy' ? 'работает' : health}
          color={health === 'healthy' ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard title="Эксперименты" value={experiments.length} />
        <StatCard title="Коллизии найдены" value={collisions} color="text-yellow-400" />
        <StatCard
          title="Завершено"
          value={experiments.filter(e => e.status === 'completed').length}
        />
        </div>
      </div>

      {/* Быстрые действия */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Быстрые действия</h2>
          <InfoModal title={dashboardActions.title} size="sm">{dashboardActions.content}</InfoModal>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ActionCard
            title="Тест хэш-функции"
            desc="Вычислить и сравнить хэши"
            onClick={() => navigate('/hash')}
          />
          <ActionCard
            title="SAT-кодирование"
            desc="Кодировать раунды хэша в CNF"
            onClick={() => navigate('/sat')}
          />
          <ActionCard
            title="Запустить эксперимент"
            desc="Комбинированная атака Дифф+SAT"
            onClick={() => navigate('/experiment')}
          />
        </div>
      </div>

      {/* Графики по экспериментам */}
      {experiments.length > 0 && (
        <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Графики</h2>
          <InfoModal title={dashboardCharts.title} size="sm">{dashboardCharts.content}</InfoModal>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Pie: распределение по статусам */}
          {statusData.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 overflow-hidden">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Распределение по статусам</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      innerRadius={35}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.name] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                      formatter={(v: number) => [v, 'Экспериментов']}
                    />
                    <Legend
                      formatter={v => <span style={{ color: '#cbd5e1', fontSize: 12 }}>{v}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Bar: распределение по методам атаки */}
          {methodData.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">Распределение по методам атаки</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={methodData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(v: number) => [v, 'Экспериментов']}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {methodData.map((entry, i) => (
                        <Cell key={i} fill={METHOD_COLORS[entry.name] ?? '#94a3b8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Таблица последних экспериментов */}
      {experiments.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold">Последние эксперименты</h2>
            <InfoModal title={dashboardTable.title} size="sm">{dashboardTable.content}</InfoModal>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-left pb-2">ID</th>
                <th className="text-left pb-2">Хэш</th>
                <th className="text-left pb-2">Раунды</th>
                <th className="text-left pb-2">Метод</th>
                <th className="text-left pb-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {experiments.slice(-10).reverse().map(exp => (
                <tr key={exp.id} className="border-b border-slate-700/50">
                  <td className="py-2 font-mono text-cyan-400">{exp.id}</td>
                  <td className="py-2">{exp.config.hash_function}</td>
                  <td className="py-2">{exp.config.num_rounds}</td>
                  <td className="py-2">{methodLabels[exp.config.method] ?? exp.config.method}</td>
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
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 min-w-0">
      <p className="text-xs text-slate-400 uppercase tracking-wider truncate">{title}</p>
      <p className={`text-xl font-bold mt-1 truncate ${color || 'text-white'}`}>{value}</p>
    </div>
  );
}

function ActionCard({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-slate-800 rounded-xl p-5 border border-slate-700 text-left min-w-0
                 hover:border-cyan-500/50 hover:bg-slate-800/80 transition-all cursor-pointer"
    >
      <h3 className="font-semibold text-white truncate">{title}</h3>
      <p className="text-sm text-slate-400 mt-1 truncate">{desc}</p>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400',
    running:   'bg-blue-500/20 text-blue-400',
    failed:    'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${colors[status] || 'bg-slate-600 text-slate-300'}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}
