export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">System Info</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-400">Backend URL</p>
            <p className="text-white font-mono">http://localhost:8000</p>
          </div>
          <div>
            <p className="text-slate-400">Frontend URL</p>
            <p className="text-white font-mono">http://localhost:3000</p>
          </div>
          <div>
            <p className="text-slate-400">API Docs</p>
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
            <p className="text-slate-400">Project</p>
            <p className="text-white">Hash Cryptanalysis Framework v0.1.0</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">Available SAT Solvers</h2>
        <div className="space-y-2 text-sm">
          {[
            { name: 'CaDiCaL 1.5.3', id: 'cadical153', desc: 'Modern, high-performance' },
            { name: 'Glucose 4', id: 'glucose4', desc: 'Aggressive clause deletion' },
            { name: 'MiniSAT 2.2', id: 'minisat22', desc: 'Classic CDCL solver' },
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
        <h2 className="text-lg font-semibold text-slate-200">Supported Hash Functions</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-slate-900 rounded-lg p-3 border border-slate-600">
            <p className="text-white font-medium">SHA-256</p>
            <p className="text-xs text-slate-400">64 rounds, 256-bit output, 32-bit words</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-3 border border-slate-600">
            <p className="text-white font-medium">SHA-1</p>
            <p className="text-xs text-slate-400">80 rounds, 160-bit output, 32-bit words</p>
          </div>
        </div>
      </div>
    </div>
  );
}
