/**
 * Info modal content for all sections.
 * Each export is a { title, content } object used by InfoModal.
 */
import { Formula, V, Sub, Sup } from '../components/InfoModal';

// ─── Sidebar navigation items ────────────────────────────────────────────────

export const sidebarDashboard = {
  title: 'Дашборд',
  content: (
    <>
      <p>Обзорная панель проекта. Отображает общую статистику по всем запущенным экспериментам: количество, статусы, найденные коллизии.</p>
      <p>Графики показывают распределение экспериментов по статусам (завершён / выполняется / ошибка) и по методам атаки (комбинированный, чистый SAT, дифференциальный).</p>
    </>
  ),
};

export const sidebarHash = {
  title: 'Хэш-функции',
  content: (
    <>
      <p>Вычисление хэш-значений и сравнение двух сообщений. Поддерживаются SHA-256, SHA-1, MD5, MD4 с произвольным числом раундов.</p>
      <p>Хэш-функция <V>H</V> преобразует сообщение произвольной длины в фиксированный дайджест:</p>
      <Formula>H(M) &rarr; digest (128&ndash;256 бит)</Formula>
    </>
  ),
};

export const sidebarDifferential = {
  title: 'Дифференциальный анализ',
  content: (
    <>
      <p>Оценка вероятности дифференциальной характеристики методом Монте-Карло. Для заданной разности сообщений <V>&Delta;M</V> измеряется, как часто выходные слова совпадают.</p>
      <Formula>Pr[H(M) = H(M &oplus; &Delta;M)]</Formula>
      <p>Чем выше частичное совпадение — тем перспективнее характеристика для SAT-атаки.</p>
    </>
  ),
};

export const sidebarSAT = {
  title: 'SAT-кодирование',
  content: (
    <>
      <p>Преобразование раундов хэш-функции в формулу конъюнктивной нормальной формы (CNF). Каждая битовая операция (AND, XOR, сложение mod 2<Sup>32</Sup>) кодируется набором дизъюнктов.</p>
      <Formula>&phi; = C<Sub>1</Sub> &and; C<Sub>2</Sub> &and; ... &and; C<Sub>n</Sub></Formula>
      <p>Результат — файл DIMACS CNF, подаваемый SAT-решателю.</p>
    </>
  ),
};

export const sidebarExperiment = {
  title: 'Эксперимент',
  content: (
    <>
      <p>Запуск единичной атаки на поиск коллизии. Комбинирует дифференциальный анализ с SAT-решением: генерирует кандидатные разности, кодирует в CNF и ищет удовлетворяющее присваивание.</p>
      <p>Поддерживает три стратегии: последовательную, итеративную (с мутацией разностей) и гибридную (ранжирование + SAT).</p>
    </>
  ),
};

export const sidebarBatch = {
  title: 'Батч / Grid Search',
  content: (
    <>
      <p>Массовый запуск экспериментов по сетке параметров (grid search). Автоматически перебирает все комбинации раундов, решателей, таймаутов и хэш-функций.</p>
      <p>Эксперименты выполняются параллельно в пуле потоков. Результаты агрегируются: число найденных коллизий, среднее и лучшее время.</p>
    </>
  ),
};


// ─── Dashboard page sections ─────────────────────────────────────────────────

export const dashboardStats = {
  title: 'Статистические карточки',
  content: (
    <>
      <p>Сводная информация по текущему состоянию системы:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>Статус бэкенда</strong> — проверка доступности API сервера</li>
        <li><strong>Эксперименты</strong> — общее число запущенных экспериментов</li>
        <li><strong>Коллизии найдены</strong> — число успешных атак (H(M1) = H(M2), M1 &ne; M2)</li>
        <li><strong>Завершено</strong> — эксперименты со статусом «completed»</li>
      </ul>
    </>
  ),
};

export const dashboardActions = {
  title: 'Быстрые действия',
  content: (
    <>
      <p>Ярлыки для перехода к основным функциям:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>Тест хэш-функции</strong> — вычислить хэш сообщения или сравнить два</li>
        <li><strong>SAT-кодирование</strong> — получить CNF-формулу для анализа</li>
        <li><strong>Запустить эксперимент</strong> — полная атака Дифф+SAT</li>
      </ul>
    </>
  ),
};

export const dashboardCharts = {
  title: 'Графики экспериментов',
  content: (
    <>
      <p><strong>Круговая диаграмма</strong> — распределение по статусам (завершён / выполняется / ошибка).</p>
      <p><strong>Столбчатая диаграмма</strong> — распределение по методам атаки (комбинированный, чистый SAT, дифференциальный).</p>
      <p>Графики появляются после запуска хотя бы одного эксперимента.</p>
    </>
  ),
};

export const dashboardTable = {
  title: 'Таблица экспериментов',
  content: (
    <>
      <p>Последние 10 экспериментов в обратном хронологическом порядке. Показывает ID, хэш-функцию, число раундов, метод атаки и текущий статус.</p>
    </>
  ),
};

// ─── Hash page sections ──────────────────────────────────────────────────────

export const hashSettings = {
  title: 'Настройки хэширования',
  content: (
    <>
      <p>Выберите хэш-функцию и число раундов для вычисления. Уменьшение раундов ослабляет хэш и используется в криптоанализе.</p>
      <p>Конструкция Меркла-Дамгорда:</p>
      <Formula>H<Sub>i</Sub> = compress(H<Sub>i-1</Sub>, M<Sub>i</Sub>) = f(H<Sub>i-1</Sub>, M<Sub>i</Sub>) + H<Sub>i-1</Sub></Formula>
      <p>Где <V>f</V> — раундовая функция, <V>+</V> — поэлементное сложение mod 2<Sup>32</Sup> (feed-forward).</p>
      <p><strong>SHA-256</strong>: 64 раунда, 8 слов состояния, 256-бит выход</p>
      <p><strong>SHA-1</strong>: 80 раундов, 5 слов состояния, 160-бит выход</p>
      <p><strong>MD5</strong>: 64 раунда, 4 слова состояния, 128-бит выход</p>
      <p><strong>MD4</strong>: 48 раундов, 4 слова состояния, 128-бит выход</p>
    </>
  ),
};

export const hashCompute = {
  title: 'Вычисление хэша',
  content: (
    <>
      <p>Вычисление хэш-значения сообщения. Ввод может быть текстовым (UTF-8) или в hex-формате.</p>
      <Formula>digest = H<Sub>r</Sub>(M)</Formula>
      <p>Где <V>r</V> — число раундов (может быть меньше полного). Результат — hex-строка фиксированной длины.</p>
    </>
  ),
};

export const hashCompare = {
  title: 'Сравнение двух сообщений',
  content: (
    <>
      <p>Сравнение хэшей двух сообщений. Вычисляются:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>Хэши</strong> H(M1) и H(M2)</li>
        <li><strong>Расстояние Хэмминга</strong> — число различающихся бит</li>
        <li><strong>XOR-разность</strong> — H(M1) &oplus; H(M2)</li>
      </ul>
      <p>Если H(M1) = H(M2) при M1 &ne; M2 — это <strong>коллизия</strong>.</p>
    </>
  ),
};

// ─── Differential page sections ──────────────────────────────────────────────

export const diffCharacteristic = {
  title: 'Дифференциальная характеристика',
  content: (
    <>
      <p>Дифференциальный криптоанализ исследует, как разность входных данных <V>&Delta;M</V> распространяется через раунды хэш-функции.</p>
      <Formula>&Delta;M = M &oplus; M' &rarr; &Delta;H = H(M) &oplus; H(M')</Formula>
      <p>Метод Монте-Карло: для <V>N</V> случайных сообщений <V>M</V> вычисляется H(M) и H(M &oplus; &Delta;M), затем сравниваются выходные слова.</p>
      <p><strong>Частичное совпадение по словам</strong> — доля пар, у которых <V>i</V>-е выходное слово совпадает. Baseline: 50% (случайная функция даёт совпадение с вер. 2<Sup>-32</Sup> для слова, но мы считаем побитово).</p>
      <p><strong>Частота коллизий</strong> — доля пар с полным совпадением всех выходных слов.</p>
    </>
  ),
};

export const diffResults = {
  title: 'Результаты анализа',
  content: (
    <>
      <p>График показывает долю частичных совпадений для каждого слова выходного состояния.</p>
      <ul className="list-disc list-inside space-y-1">
        <li><span className="text-green-400">Зелёный</span> — совпадение &ge; 50% (лучше случайного)</li>
        <li><span className="text-red-400">Красный</span> — совпадение &lt; 50% (хуже случайного)</li>
        <li><span className="text-yellow-400">Пунктир</span> — baseline 50%</li>
      </ul>
      <p>Log<Sub>2</Sub> вероятности — логарифмическая оценка шанса коллизии. Чем ближе к 0, тем выше вероятность.</p>
    </>
  ),
};

// ─── SAT page sections ───────────────────────────────────────────────────────

export const satEncoding = {
  title: 'Кодирование в CNF',
  content: (
    <>
      <p>Каждая операция хэш-функции преобразуется в набор булевых дизъюнктов:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>XOR</strong>: <V>a &oplus; b = c</V> &rarr; 4 дизъюнкта по 3 литерала</li>
        <li><strong>AND</strong>: <V>a &and; b = c</V> &rarr; 3 дизъюнкта</li>
        <li><strong>Сложение mod 2<Sup>32</Sup></strong>: цепочка полных сумматоров с переносами</li>
        <li><strong>Правый сдвиг / ротация</strong>: перемаршрутка переменных (0 дизъюнктов)</li>
      </ul>
      <Formula>&phi;<Sub>hash</Sub> = &phi;<Sub>round1</Sub> &and; &phi;<Sub>round2</Sub> &and; ... &and; &phi;<Sub>roundN</Sub></Formula>
      <p><strong>Одиночный хэш</strong> — кодирование одного вычисления H(M).</p>
      <p><strong>Поиск коллизии</strong> — два экземпляра + ограничение H(M1)=H(M2) и M1&ne;M2.</p>
    </>
  ),
};

export const satStats = {
  title: 'Статистика CNF',
  content: (
    <>
      <p><strong>Переменные</strong> — булевы переменные (по одной на каждый бит в каждом промежуточном значении).</p>
      <p><strong>Дизъюнкты</strong> — дизъюнкции литералов. Формула выполнима, если все дизъюнкты одновременно истинны.</p>
      <p><strong>Соотношение дизъюнкты/переменные</strong> — мера «плотности» формулы. Для типичных хэш-кодирований: 3&ndash;5.</p>
      <p><strong>Распределение длин дизъюнктов</strong> — сколько дизъюнктов содержит 1, 2, 3, ... литералов. Преобладание коротких дизъюнктов ускоряет единичное распространение.</p>
    </>
  ),
};

// ─── Experiment page sections ────────────────────────────────────────────────

export const expConfig = {
  title: 'Конфигурация эксперимента',
  content: (
    <>
      <p>Настройка параметров атаки на поиск коллизии:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>Хэш-функция</strong> — SHA-256, MD5 или MD4 (SHA-1 не имеет SAT-энкодера)</li>
        <li><strong>Раунды</strong> — число раундов (меньше = проще для решателя)</li>
        <li><strong>Метод</strong> — комбинированный (дифф+SAT), чистый SAT, чистый дифференциальный</li>
        <li><strong>Стратегия</strong> — для комбинированного метода:
          <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
            <li><em>Последовательная</em> — перебор разностей по порядку</li>
            <li><em>Итеративная</em> — мутация неудачных разностей (эволюционный поиск)</li>
            <li><em>Гибридная</em> — сначала Монте-Карло ранжирование, потом SAT на лучших</li>
          </ul>
        </li>
        <li><strong>SAT-решатель</strong> — CaDiCaL (быстрый), Glucose (агрессивное удаление), MiniSAT (классический)</li>
        <li><strong>Таймаут</strong> — максимальное время на одну попытку SAT-решения</li>
        <li><strong>Макс. характеристик</strong> — сколько разных разностей попробовать</li>
      </ul>
    </>
  ),
};

export const expResults = {
  title: 'Результаты эксперимента',
  content: (
    <>
      <p>Если коллизия найдена, отображаются:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>M1, M2</strong> — два 512-битных сообщения (16 &times; 32-бит слов)</li>
        <li><strong>XOR-разность</strong> — M1 &oplus; M2 (жёлтым выделены активные слова)</li>
        <li><strong>Хэши</strong> — H(M1) и H(M2), должны совпадать</li>
        <li><strong>Вес Хэмминга</strong> — число единичных бит в XOR-разности</li>
      </ul>
      <Formula>H<Sub>r</Sub>(M1) = H<Sub>r</Sub>(M2), M1 &ne; M2</Formula>
      <p>Диаграммы показывают распределение времени (SAT-решение vs. прочее) и статистику CDCL-решателя (конфликты, рестарты, распространения).</p>
    </>
  ),
};

// ─── Batch page sections ─────────────────────────────────────────────────────

export const batchGrid = {
  title: 'Сетка параметров (Grid Search)',
  content: (
    <>
      <p>Задайте списки значений для каждого параметра через запятую. Система создаст декартово произведение всех комбинаций.</p>
      <Formula>N = |rounds| &times; |solvers| &times; |timeouts| &times; |hash_funcs| &times; |max_chars|</Formula>

      <p><strong>Описание полей:</strong></p>
      <ul className="list-disc list-inside space-y-2">
        <li>
          <strong>Хэш-функция</strong> — через запятую, без пробелов. Доступные значения:
          <br /><code className="text-cyan-400">sha256</code>, <code className="text-cyan-400">md5</code>, <code className="text-cyan-400">md4</code>
          <br />Пример: <code>sha256,md5</code>
        </li>
        <li>
          <strong>Раунды</strong> — целые числа через запятую. Для каждой хэш-функции есть максимум: SHA-256 — 64, MD5 — 64, MD4 — 48. На практике коллизии находятся при малом числе раундов (1–10).
          <br />Пример: <code>3,4,6,8</code>
        </li>
        <li>
          <strong>SAT-решатели</strong> — через запятую. Доступные:
          <br /><code className="text-cyan-400">cadical153</code> (CaDiCaL — рекомендуется),{' '}
          <code className="text-cyan-400">glucose4</code> (Glucose 4),{' '}
          <code className="text-cyan-400">minisat22</code> (MiniSAT)
          <br />Пример: <code>cadical153,glucose4</code>
        </li>
        <li>
          <strong>Таймауты</strong> — секунды на одну попытку SAT-решения, через запятую.
          <br />Пример: <code>30,60,120</code>
        </li>
        <li>
          <strong>Попыток</strong> — сколько разных разностей ΔM пробовать в каждом эксперименте, через запятую.
          <br />Пример: <code>5,10</code>
        </li>
      </ul>

      <p><strong>Дополнительные настройки:</strong></p>
      <ul className="list-disc list-inside space-y-2">
        <li>
          <strong>Метод</strong> — через запятую. Доступные:
          <br /><code className="text-cyan-400">combined</code> (Комбинированный Дифф+SAT),{' '}
          <code className="text-cyan-400">pure_sat</code> (Чистый SAT),{' '}
          <code className="text-cyan-400">pure_differential</code> (Чистый дифференциальный)
          <br />Пример: <code>combined,pure_sat</code>
        </li>
        <li>
          <strong>Стратегия</strong> — через запятую. Используется только для метода <code>combined</code>:
          <br /><code className="text-cyan-400">sequential</code> (последовательный перебор),{' '}
          <code className="text-cyan-400">iterative</code> (мутации неудачных разностей),{' '}
          <code className="text-cyan-400">hybrid</code> (Монте-Карло отбор + SAT)
          <br />Пример: <code>sequential,hybrid</code>
        </li>
        <li><strong>Воркеров</strong> — число одновременно выполняемых экспериментов. PySAT освобождает GIL при решении в C++, поэтому параллелизм эффективен. Рекомендуется 2–8.</li>
        <li><strong>Выборка</strong> — если комбинаций слишком много, укажите число для случайной подвыборки. Пустое поле = запустить все комбинации.</li>
      </ul>
    </>
  ),
};

export const batchDiffs = {
  title: 'Разности сообщений',
  content: (
    <>
      <p>Разность сообщений <V>&Delta;M</V> определяет, в каких битах M1 и M2 будут различаться:</p>
      <Formula>M2 = M1 &oplus; &Delta;M</Formula>
      <p><strong>Автоподбор</strong> — автоматическая генерация: однобитные MSB в каждом слове, затем LSB, затем случайные.</p>
      <p><strong>Пресеты</strong>:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><em>2 бита</em> — два старших бита, больше арифметических переносов</li>
        <li><em>Многословная</em> — разности в нескольких словах</li>
        <li><em>Тяжёлая (8 бит)</em> — 0xFF000000, высокий вес Хэмминга</li>
        <li><em>Своя разность</em> — ручной ввод 16 hex-слов</li>
      </ul>
    </>
  ),
};

export const batchProgress = {
  title: 'Прогресс батча',
  content: (
    <>
      <p>Панель отслеживания выполнения массового эксперимента в реальном времени (поллинг каждые 2 секунды).</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>Прогресс-бар</strong> — доля завершённых экспериментов, цвет отражает соотношение успехов и ошибок</li>
        <li><strong>Коллизий найдено</strong> — число экспериментов с успешной коллизией</li>
        <li><strong>Среднее / лучшее время</strong> — агрегированная статистика по завершённым</li>
        <li><strong>График по раундам</strong> — зависимость числа найденных коллизий от количества раундов</li>
      </ul>
      <p>Нажмите на строку таблицы для просмотра деталей коллизии.</p>
    </>
  ),
};

// ─── Settings page sections ──────────────────────────────────────────────────

export const settingsSystem = {
  title: 'Системная информация',
  content: (
    <>
      <p>Адреса серверов и документация:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>Бэкенд</strong> (FastAPI) — http://localhost:8000, обрабатывает все вычисления</li>
        <li><strong>Фронтенд</strong> (React + Vite) — http://localhost:3000, пользовательский интерфейс</li>
        <li><strong>Swagger UI</strong> — интерактивная документация всех API-эндпоинтов</li>
      </ul>
    </>
  ),
};

export const settingsSolvers = {
  title: 'SAT-решатели',
  content: (
    <>
      <p>CDCL-решатели (Conflict-Driven Clause Learning) ищут удовлетворяющее присваивание булевой формулы:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>CaDiCaL 1.5.3</strong> — современный, лучший на SAT Competition, эффективные эвристики рестартов и удаления дизъюнктов</li>
        <li><strong>Glucose 4</strong> — агрессивное удаление выученных дизъюнктов (LBD-метрика), хорош на структурированных формулах</li>
        <li><strong>MiniSAT 2.2</strong> — классический эталонный решатель, основа для многих форков</li>
      </ul>
      <p>Все решатели используют одинаковый DIMACS CNF формат и PySAT как Python-обёртку.</p>
    </>
  ),
};

export const settingsHashFunctions = {
  title: 'Хэш-функции',
  content: (
    <>
      <p>Поддерживаемые хэш-функции семейства Меркла-Дамгорда:</p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>SHA-256</strong> — 64 раунда, 8&times;32-бит слов состояния, функции Ch, Maj, &Sigma;</li>
        <li><strong>SHA-1</strong> — 80 раундов, 5&times;32-бит, функция f(t) зависит от раунда</li>
        <li><strong>MD5</strong> — 64 раунда, 4&times;32-бит, функции F, G, H, I по группам из 16 раундов</li>
        <li><strong>MD4</strong> — 48 раундов, 4&times;32-бит, предшественник MD5, более простые функции</li>
      </ul>
      <p>SHA-1 доступна только для хэширования и дифференциального анализа (SAT-энкодер отсутствует).</p>
    </>
  ),
};
