# 9. Анализ результатов и визуализация

## 9.1 Метрики оценки

### Основные метрики

| Метрика | Описание | Единица |
|---------|----------|---------|
| **Время решения** | Суммарное время от начала до нахождения коллизии | секунды |
| **Число конфликтов** | Количество конфликтов в SAT-решателе | целое |
| **Число решений** | Количество decisions в CDCL | целое |
| **Успешность** | Доля запусков, нашедших коллизию | % |
| **Размер CNF** | Число переменных и клозов | целое |
| **Вероятность характеристики** | log₂(Pr) лучшей найденной характеристики | log₂ |
| **Число достаточных условий** | Количество бит, зафиксированных характеристикой | целое |
| **Ускорение (speedup)** | T_pure_sat / T_combined | безразм. |

### Вторичные метрики

| Метрика | Описание |
|---------|----------|
| **Число learnt clauses** | Объём обученных клозов |
| **Число перезапусков** | Restart count в SAT-решателе |
| **Пиковая память** | Максимальное потребление RAM |
| **Глубина backjump** | Средняя глубина отката при конфликте |

---

## 9.2 Статистическая обработка

### Множественные запуски

Каждый эксперимент запускается N раз (N ≥ 5) с различными random seed для получения статистически значимых результатов.

```python
import numpy as np
from scipy import stats

def analyze_experiment_runs(times: list[float], confidence: float = 0.95):
    """Статистический анализ множественных запусков."""
    n = len(times)
    mean = np.mean(times)
    std = np.std(times, ddof=1)
    se = std / np.sqrt(n)

    # Доверительный интервал (t-распределение)
    t_crit = stats.t.ppf((1 + confidence) / 2, df=n-1)
    ci_low = mean - t_crit * se
    ci_high = mean + t_crit * se

    return {
        "mean": mean,
        "median": np.median(times),
        "std": std,
        "ci_lower": ci_low,
        "ci_upper": ci_high,
        "min": np.min(times),
        "max": np.max(times),
    }
```

### Сравнение методов

Для статистически корректного сравнения двух методов используется **парный t-тест** или **тест Вилкоксона** (при ненормальном распределении):

```python
def compare_methods(times_a: list, times_b: list) -> dict:
    """Сравнение двух методов на одинаковых задачах."""
    # Тест нормальности
    _, p_norm_a = stats.shapiro(times_a)
    _, p_norm_b = stats.shapiro(times_b)

    if p_norm_a > 0.05 and p_norm_b > 0.05:
        # Параметрический тест
        t_stat, p_value = stats.ttest_rel(times_a, times_b)
        test_name = "paired t-test"
    else:
        # Непараметрический тест
        t_stat, p_value = stats.wilcoxon(times_a, times_b)
        test_name = "Wilcoxon signed-rank"

    speedup = np.mean(times_a) / np.mean(times_b)

    return {
        "test": test_name,
        "statistic": t_stat,
        "p_value": p_value,
        "significant": p_value < 0.05,
        "speedup": speedup,
    }
```

---

## 9.3 Визуализация

### 9.3.1 Время решения vs. число раундов

```python
import matplotlib.pyplot as plt

def plot_time_vs_rounds(results: dict):
    """График: время решения в зависимости от числа раундов."""
    fig, ax = plt.subplots(figsize=(10, 6))

    for method, data in results.items():
        rounds = [d['rounds'] for d in data]
        times = [d['mean_time'] for d in data]
        ci_low = [d['ci_lower'] for d in data]
        ci_high = [d['ci_upper'] for d in data]

        ax.plot(rounds, times, marker='o', label=method)
        ax.fill_between(rounds, ci_low, ci_high, alpha=0.2)

    ax.set_xlabel('Число раундов')
    ax.set_ylabel('Время решения (с)')
    ax.set_yscale('log')
    ax.set_title('Сравнение методов: время решения')
    ax.legend()
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('time_vs_rounds.png', dpi=150)
```

### 9.3.2 Число конфликтов SAT-решателя

```python
def plot_conflicts_comparison(results: dict):
    """Столбчатая диаграмма: конфликты по методам для фиксированного числа раундов."""
    fig, axes = plt.subplots(1, len(rounds_list), figsize=(15, 5))

    for ax, rounds in zip(axes, rounds_list):
        methods = list(results.keys())
        conflicts = [results[m][rounds]['mean_conflicts'] for m in methods]

        ax.bar(methods, conflicts, color=['#2196F3', '#FF9800', '#4CAF50'])
        ax.set_title(f'{rounds} раундов')
        ax.set_ylabel('Число конфликтов')

    plt.tight_layout()
    plt.savefig('conflicts_comparison.png', dpi=150)
```

### 9.3.3 Тепловая карта вероятностей характеристик

```python
import seaborn as sns

def plot_characteristic_heatmap(characteristics: list):
    """Тепловая карта: вероятности дифференциальных характеристик по раундам."""
    data = np.zeros((len(characteristics), max_rounds))

    for i, char in enumerate(characteristics):
        for j, rd in enumerate(char.round_diffs):
            data[i, j] = rd.log2_probability

    fig, ax = plt.subplots(figsize=(14, 8))
    sns.heatmap(data, ax=ax, cmap='RdYlGn', center=-10,
                xticklabels=range(1, max_rounds+1),
                yticklabels=[f"Char #{i}" for i in range(len(characteristics))])
    ax.set_xlabel('Номер раунда')
    ax.set_ylabel('Характеристика')
    ax.set_title('Вероятности дифференциальных характеристик (log₂)')
    plt.savefig('characteristic_heatmap.png', dpi=150)
```

### 9.3.4 Распределение активных бит

```python
def plot_active_bits_distribution(characteristics: list):
    """Гистограмма: распределение числа активных бит в характеристиках."""
    weights = [sum(rd.total_active_bits for rd in c.round_diffs)
               for c in characteristics]

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.hist(weights, bins=30, edgecolor='black', alpha=0.7)
    ax.set_xlabel('Суммарный вес Хэмминга')
    ax.set_ylabel('Число характеристик')
    ax.set_title('Распределение активных бит')
    plt.savefig('active_bits_dist.png', dpi=150)
```

### 9.3.5 Визуализация дифференциального пути

```python
import networkx as nx

def visualize_differential_path(characteristic):
    """Граф распространения разностей через раунды."""
    G = nx.DiGraph()

    for i, rd in enumerate(characteristic.round_diffs):
        for word, wd in rd.word_diffs.items():
            if wd.hamming_weight > 0:
                node = f"R{i}_{word}"
                G.add_node(node, weight=wd.hamming_weight, round=i)

                # Связи с предыдущим раундом
                if i > 0:
                    for prev_word in get_input_words(word, i):
                        prev_node = f"R{i-1}_{prev_word}"
                        if prev_node in G:
                            G.add_edge(prev_node, node)

    pos = nx.multipartite_layout(G, subset_key="round")
    weights = [G.nodes[n]['weight'] * 100 for n in G.nodes]

    fig, ax = plt.subplots(figsize=(16, 10))
    nx.draw(G, pos, ax=ax, with_labels=True, node_size=weights,
            node_color='lightcoral', edge_color='gray',
            font_size=8, arrows=True)
    ax.set_title('Дифференциальный путь')
    plt.savefig('diff_path.png', dpi=150)
```

### 9.3.6 Сводная таблица результатов

```python
def generate_summary_table(all_results: dict) -> pd.DataFrame:
    """Сводная таблица для включения в ВКР."""
    rows = []
    for method in all_results:
        for rounds in all_results[method]:
            r = all_results[method][rounds]
            rows.append({
                'Метод': method,
                'Раунды': rounds,
                'Время (с)': f"{r['mean_time']:.1f} ± {r['std_time']:.1f}",
                'Конфликты': f"{r['mean_conflicts']:.0f}",
                'Успешность (%)': f"{r['success_rate']*100:.1f}",
                'Переменных': r['num_vars'],
                'Клозов': r['num_clauses'],
                'Ускорение': f"{r.get('speedup', '-')}",
            })
    return pd.DataFrame(rows)
```

---

## 9.4 Интерпретация результатов

### Ожидаемые выводы

1. **Комбинированный метод эффективнее чистого SAT** для числа раундов > 10: ускорение от 2× до 100× за счёт сужения пространства поиска.

2. **Экспоненциальный рост** времени решения с числом раундов — фундаментальное ограничение.

3. **Качество характеристик критично:** топ-5 характеристик дают >80% всех найденных коллизий.

4. **CryptoMiniSat оптимален** для криптографических задач благодаря XOR-клозам.

5. **Итеративная стратегия** эффективнее последовательной для большого числа раундов.

---

## 9.5 Структура файлов

```
src/analysis/
├── result_parser.py     # Парсинг результатов экспериментов
├── statistics.py        # Статистическая обработка
├── visualization.py     # Все графики и визуализации
├── comparison.py        # Сравнение методов
└── report_generator.py  # Генерация таблиц для ВКР
```
