# 12. Веб-интерфейс (Frontend)

## 12.1 Назначение

Веб-интерфейс предоставляет:
- Настройку параметров экспериментов через UI (выбор хэш-функции, числа раундов, решателя, стратегии).
- Запуск экспериментов и мониторинг прогресса в реальном времени.
- Интерактивную визуализацию результатов (графики, таблицы, дифференциальные пути).
- Сравнение экспериментов между собой.
- Экспорт результатов (CSV, JSON, LaTeX).

**Стек:** React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Vite.

---

## 12.2 Страницы и навигация

```
/                          → Dashboard (обзор последних экспериментов)
/experiments/new           → Настройка и запуск нового эксперимента
/experiments/:id           → Детали эксперимента (статус, результаты)
/experiments/:id/results   → Подробные результаты с графиками
/compare                   → Сравнение нескольких экспериментов
/hash-functions            → Просмотр и тестирование хэш-функций
/differential              → Генерация и просмотр дифф. характеристик
/settings                  → Настройки (решатели, пути, таймауты)
```

---

## 12.3 Ключевые компоненты

### 12.3.1 Dashboard

Главная страница с обзором:
- Список последних экспериментов (таблица с фильтрацией и сортировкой).
- Быстрые карточки: «Всего экспериментов», «Найдено коллизий», «Среднее время».
- Кнопка «Новый эксперимент».

```tsx
// frontend/src/pages/Dashboard.tsx
export function Dashboard() {
  const { data: experiments } = useExperiments();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Всего экспериментов" value={experiments?.length ?? 0} />
        <StatCard title="Найдено коллизий" value={countCollisions(experiments)} />
        <StatCard title="Ср. время (с)" value={avgTime(experiments)} />
      </div>

      <ExperimentTable experiments={experiments ?? []} />
    </div>
  );
}
```

### 12.3.2 Настройка эксперимента (Experiment Setup)

Форма с разделами:

**Раздел 1: Хэш-функция**
- Выпадающий список: SHA-256, SHA-1, MD5
- Слайдер или числовое поле: число раундов (с подсказкой диапазона)

**Раздел 2: Метод криптоанализа**
- Radio-группа: «Чистый SAT», «Чистый дифференциальный», «Комбинированный»
- Для комбинированного — подвыбор стратегии: Sequential / Iterative / Hybrid

**Раздел 3: Параметры дифференциального анализа** (если выбран комбинированный)
- Порог вероятности (log₂): слайдер от -10 до -50
- Макс. число характеристик: числовое поле
- Макс. вес Хэмминга входной разности: числовое поле

**Раздел 4: Параметры SAT-решателя**
- Выбор решателя: CryptoMiniSat / MiniSAT / Glucose / Cadical
- Таймаут (секунды): числовое поле
- Число потоков: числовое поле
- XOR-режим (для CryptoMiniSat): переключатель

**Раздел 5: Общие настройки**
- Random seed: числовое поле (или «случайный»)
- Число повторений: 1–20
- Комментарий к эксперименту: текстовое поле

```tsx
// frontend/src/pages/NewExperiment.tsx
export function NewExperiment() {
  const [config, setConfig] = useState<ExperimentConfig>(defaultConfig);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Новый эксперимент</h1>

      <HashFunctionSection config={config} onChange={setConfig} />
      <MethodSection config={config} onChange={setConfig} />
      {config.method === 'combined' && (
        <DifferentialParamsSection config={config} onChange={setConfig} />
      )}
      <SolverSection config={config} onChange={setConfig} />
      <GeneralSection config={config} onChange={setConfig} />

      <Button onClick={() => runExperiment(config)} size="lg">
        Запустить эксперимент
      </Button>
    </div>
  );
}
```

### 12.3.3 Мониторинг эксперимента (Live Status)

Real-time обновление через WebSocket:
- Прогресс-бар: текущий раунд / общее число.
- Текущая характеристика (при комбинированном методе).
- Логи SAT-решателя (streaming).
- Статус: «Генерация характеристик» → «SAT-кодирование» → «Решение» → «Верификация».

```tsx
// frontend/src/pages/ExperimentDetails.tsx
export function ExperimentDetails({ id }: { id: string }) {
  const { status, logs } = useExperimentWebSocket(id);

  return (
    <div className="space-y-6">
      <ExperimentHeader id={id} status={status} />

      <ProgressSection
        phase={status.phase}
        progress={status.progress}
        currentCharacteristic={status.currentCharacteristic}
      />

      <div className="grid grid-cols-2 gap-4">
        <LiveStatsCard stats={status.solverStats} />
        <LiveLogPanel logs={logs} />
      </div>

      {status.phase === 'completed' && (
        <ResultsSummary results={status.results} />
      )}
    </div>
  );
}
```

### 12.3.4 Результаты эксперимента

Подробная страница с вкладками:

**Вкладка «Обзор»:**
- Сводная таблица метрик.
- Найденные коллизии (если есть) — с hex-представлением сообщений.

**Вкладка «Графики»:**
- Время vs. раунды (если несколько конфигураций).
- Распределение конфликтов SAT-решателя.
- Вероятности характеристик.

**Вкладка «Дифференциальный путь»:**
- Интерактивная визуализация дифференциального пути через раунды.
- Цветовая кодировка: красный — активные биты, зелёный — нулевая разность.

**Вкладка «SAT-статистика»:**
- Число переменных и клозов.
- Графики: конфликты, decisions, propagations по времени.

**Вкладка «Экспорт»:**
- Скачать: CSV, JSON, LaTeX-таблица, CNF-файлы, графики PNG/SVG.

```tsx
// frontend/src/pages/ExperimentResults.tsx
export function ExperimentResults({ id }: { id: string }) {
  const { data: results } = useExperimentResults(id);

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Обзор</TabsTrigger>
        <TabsTrigger value="charts">Графики</TabsTrigger>
        <TabsTrigger value="diff-path">Дифф. путь</TabsTrigger>
        <TabsTrigger value="sat-stats">SAT-статистика</TabsTrigger>
        <TabsTrigger value="export">Экспорт</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <MetricsSummaryTable results={results} />
        {results?.collisions && <CollisionDisplay collisions={results.collisions} />}
      </TabsContent>

      <TabsContent value="charts">
        <TimeVsRoundsChart data={results?.timeData} />
        <ConflictsDistribution data={results?.conflictData} />
      </TabsContent>

      <TabsContent value="diff-path">
        <DifferentialPathVisualization characteristic={results?.bestCharacteristic} />
      </TabsContent>

      <TabsContent value="sat-stats">
        <SATStatsPanel stats={results?.solverStats} />
      </TabsContent>

      <TabsContent value="export">
        <ExportPanel experimentId={id} />
      </TabsContent>
    </Tabs>
  );
}
```

### 12.3.5 Сравнение экспериментов

Страница для выбора 2–5 экспериментов и сравнения по всем метрикам:
- Таблица сравнения бок о бок.
- Наложенные графики (overlay charts).
- Выделение лучшего результата.

```tsx
// frontend/src/pages/CompareExperiments.tsx
export function CompareExperiments() {
  const [selected, setSelected] = useState<string[]>([]);
  const { data: comparison } = useCompareResults(selected);

  return (
    <div className="space-y-6">
      <ExperimentSelector selected={selected} onChange={setSelected} maxCount={5} />

      {comparison && (
        <>
          <ComparisonTable data={comparison} />
          <OverlayChart data={comparison} metric="time" />
          <OverlayChart data={comparison} metric="conflicts" />
        </>
      )}
    </div>
  );
}
```

### 12.3.6 Тестирование хэш-функций

Интерактивная страница для изучения хэш-функций:
- Ввод сообщения → вычисление хэша.
- Ввод двух сообщений → сравнение хэшей, подсветка различий.
- Побитовая визуализация внутреннего состояния по раундам.
- Изменение одного бита входа → визуализация лавинного эффекта.

---

## 12.4 Компоненты визуализации

### Интерактивный граф дифференциального пути (D3.js)

```tsx
// frontend/src/components/DifferentialPathVisualization.tsx
export function DifferentialPathVisualization({ characteristic }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !characteristic) return;

    const svg = d3.select(svgRef.current);
    const rounds = characteristic.round_diffs;

    // Для каждого раунда: отрисовать 32-битные слова
    rounds.forEach((round, i) => {
      Object.entries(round.word_diffs).forEach(([word, diff]) => {
        const y = i * ROUND_HEIGHT;
        const group = svg.append('g').attr('transform', `translate(0, ${y})`);

        // 32 бита — каждый как прямоугольник
        for (let bit = 0; bit < 32; bit++) {
          const active = (diff.xor_diff >> bit) & 1;
          group.append('rect')
            .attr('x', bit * BIT_WIDTH)
            .attr('y', WORD_OFFSETS[word])
            .attr('width', BIT_WIDTH - 1)
            .attr('height', BIT_HEIGHT)
            .attr('fill', active ? '#ef4444' : '#22c55e')
            .attr('opacity', active ? 1.0 : 0.3);
        }
      });
    });
  }, [characteristic]);

  return <svg ref={svgRef} width={800} height={characteristic.round_diffs.length * ROUND_HEIGHT} />;
}
```

### Графики Recharts

```tsx
// frontend/src/components/charts/TimeVsRoundsChart.tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';

export function TimeVsRoundsChart({ data }: { data: ChartData[] }) {
  return (
    <LineChart width={700} height={400} data={data}>
      <XAxis dataKey="rounds" label={{ value: 'Число раундов', position: 'bottom' }} />
      <YAxis scale="log" label={{ value: 'Время (с)', angle: -90 }} />
      <Tooltip />
      <Legend />
      <Line type="monotone" dataKey="pureSat" name="Чистый SAT" stroke="#2196F3" />
      <Line type="monotone" dataKey="combined" name="Комбинированный" stroke="#4CAF50" />
      <Line type="monotone" dataKey="differential" name="Дифференциальный" stroke="#FF9800" />
    </LineChart>
  );
}
```

---

## 12.5 WebSocket-протокол

Для real-time обновления статуса экспериментов:

```typescript
// frontend/src/api/websocket.ts
interface ExperimentStatusMessage {
  type: 'status_update';
  experiment_id: string;
  phase: 'generating_characteristics' | 'encoding' | 'solving' | 'verifying' | 'completed' | 'failed';
  progress: number;         // 0.0 – 1.0
  current_round?: number;
  current_characteristic?: number;
  solver_stats?: {
    conflicts: number;
    decisions: number;
    time_elapsed: number;
  };
  log_line?: string;
}

export function useExperimentWebSocket(id: string) {
  const [status, setStatus] = useState<ExperimentStatusMessage | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/experiments/${id}`);
    ws.onmessage = (event) => {
      const msg: ExperimentStatusMessage = JSON.parse(event.data);
      setStatus(msg);
      if (msg.log_line) {
        setLogs(prev => [...prev, msg.log_line!]);
      }
    };
    return () => ws.close();
  }, [id]);

  return { status, logs };
}
```

---

## 12.6 TypeScript-типы

```typescript
// frontend/src/types/index.ts

export interface ExperimentConfig {
  hashFunction: 'sha256' | 'sha1' | 'md5';
  numRounds: number;
  method: 'pure_sat' | 'pure_differential' | 'combined';
  combinedStrategy?: 'sequential' | 'iterative' | 'hybrid';
  differentialParams?: {
    probabilityThresholdLog2: number;
    maxCharacteristics: number;
    maxHammingWeight: number;
  };
  solverParams: {
    solver: 'cryptominisat' | 'minisat' | 'glucose' | 'cadical';
    timeout: number;
    threads: number;
    useXorClauses: boolean;
  };
  seed: number | 'random';
  repetitions: number;
  comment: string;
}

export interface ExperimentResult {
  id: string;
  config: ExperimentConfig;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  metrics: {
    totalTime: number;
    diffAnalysisTime: number;
    satSolveTime: number;
    numConflicts: number;
    numDecisions: number;
    numVariables: number;
    numClauses: number;
    collisionFound: boolean;
    characteristicsGenerated: number;
    bestProbabilityLog2: number;
  };
  collisions?: Array<{
    message1Hex: string;
    message2Hex: string;
    hashHex: string;
    hammingDistance: number;
  }>;
}
```

---

## 12.7 Структура файлов frontend

```
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── api/
    │   ├── client.ts              # Axios instance
    │   ├── experiments.ts         # API-вызовы для экспериментов
    │   ├── hashFunctions.ts       # API для хэш-функций
    │   └── websocket.ts           # WebSocket-хук
    ├── components/
    │   ├── ui/                    # shadcn/ui компоненты
    │   ├── layout/
    │   │   ├── Sidebar.tsx
    │   │   ├── Header.tsx
    │   │   └── Layout.tsx
    │   ├── charts/
    │   │   ├── TimeVsRoundsChart.tsx
    │   │   ├── ConflictsChart.tsx
    │   │   ├── ProbabilityHeatmap.tsx
    │   │   └── OverlayChart.tsx
    │   ├── experiment/
    │   │   ├── HashFunctionSection.tsx
    │   │   ├── MethodSection.tsx
    │   │   ├── SolverSection.tsx
    │   │   ├── DifferentialParamsSection.tsx
    │   │   └── GeneralSection.tsx
    │   ├── results/
    │   │   ├── MetricsSummaryTable.tsx
    │   │   ├── CollisionDisplay.tsx
    │   │   ├── SATStatsPanel.tsx
    │   │   └── ExportPanel.tsx
    │   └── visualization/
    │       ├── DifferentialPathVisualization.tsx
    │       ├── AvalancheEffect.tsx
    │       └── BitGridDisplay.tsx
    ├── pages/
    │   ├── Dashboard.tsx
    │   ├── NewExperiment.tsx
    │   ├── ExperimentDetails.tsx
    │   ├── ExperimentResults.tsx
    │   ├── CompareExperiments.tsx
    │   ├── HashFunctions.tsx
    │   ├── DifferentialExplorer.tsx
    │   └── Settings.tsx
    ├── store/
    │   └── useStore.ts            # Zustand store
    └── types/
        └── index.ts
```
