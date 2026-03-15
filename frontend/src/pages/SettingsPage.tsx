import InfoModal from '../components/InfoModal';
import { settingsSystem, settingsSolvers, settingsHashFunctions } from '../data/infoContent';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Настройки</h1>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-200">Системная информация</h2>
          <InfoModal title={settingsSystem.title} size="sm">{settingsSystem.content}</InfoModal>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-400">URL бэкенда</p>
            <p className="text-white font-mono">http://localhost:8000</p>
          </div>
          <div>
            <p className="text-slate-400">URL фронтенда</p>
            <p className="text-white font-mono">http://localhost:3000</p>
          </div>
          <div>
            <p className="text-slate-400">Документация API</p>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:underline font-mono"
            >
              Swagger UI
            </a>
          </div>
          <div>
            <p className="text-slate-400">Проект</p>
            <p className="text-white">Hash Cryptanalysis Framework v0.1.0</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-200">Доступные SAT-решатели</h2>
          <InfoModal title={settingsSolvers.title}>{settingsSolvers.content}</InfoModal>
        </div>
        <div className="space-y-2 text-sm">
          {[
            { name: 'CaDiCaL 1.5.3', id: 'cadical153', desc: 'Современный, высокопроизводительный' },
            { name: 'Glucose 4', id: 'glucose4', desc: 'Агрессивное удаление дизъюнктов' },
            { name: 'MiniSAT 2.2', id: 'minisat22', desc: 'Классический CDCL-решатель' },
          ].map(s => (
            <div key={s.id} className="flex items-center gap-3 bg-slate-900 rounded-lg p-3 border border-slate-600">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <div>
                <p className="text-white font-medium">{s.name}</p>
                <p className="text-xs text-slate-400">{s.desc} ({s.id})</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-200">Поддерживаемые хэш-функции</h2>
          <InfoModal title={settingsHashFunctions.title}>{settingsHashFunctions.content}</InfoModal>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {[
            { name: 'SHA-256', desc: '64 раунда, 256-бит выход, 32-битные слова' },
            { name: 'SHA-1',   desc: '80 раундов, 160-бит выход, 32-битные слова' },
            { name: 'MD5',     desc: '64 раунда, 128-бит выход, 32-битные слова' },
            { name: 'MD4',     desc: '48 раундов, 128-бит выход, 32-битные слова' },
          ].map(h => (
            <div key={h.name} className="bg-slate-900 rounded-lg p-3 border border-slate-600">
              <p className="text-white font-medium">{h.name}</p>
              <p className="text-xs text-slate-400">{h.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
