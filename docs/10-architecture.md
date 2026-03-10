# 10. Архитектура системы и стек технологий

## 10.1 Общая архитектура

```
┌──────────────────────────────────────────────────────────────────┐
│                        Web UI (Frontend)                         │
│                  React + TypeScript + Tailwind                   │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌─────────────────┐  │
│  │Настройки │ │Запуск     │ │Результаты  │ │Визуализация     │  │
│  │параметров│ │экспериментов│ │и статистика│ │(графики, пути) │  │
│  └──────────┘ └───────────┘ └────────────┘ └─────────────────┘  │
└─────────────────────────┬────────────────────────────────────────┘
                          │ REST API / WebSocket
┌─────────────────────────┴────────────────────────────────────────┐
│                     Backend API (FastAPI)                         │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ /api/hash      │  │ /api/diff    │  │ /api/experiments   │    │
│  │ /api/sat       │  │ /api/solver  │  │ /api/results       │    │
│  └───────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────┬────────────────────────────────────────┘
                          │
┌─────────────────────────┴────────────────────────────────────────┐
│                     Core Engine (Python + C++)                    │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │Hash Functions │  │Differential  │  │SAT Encoding          │   │
│  │  sha256.py    │  │  analysis/   │  │  cnf_builder.py      │   │
│  │  sha1.py      │  │              │  │  bit_constraints.py   │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │SAT Solvers   │  │Combined      │  │Analysis              │   │
│  │  interface    │  │  Algorithm   │  │  statistics.py        │   │
│  │  runners      │  │              │  │  visualization.py     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 10.2 Стек технологий

### Backend

| Компонент | Технология | Назначение |
|-----------|-----------|-----------|
| Язык | Python 3.11+ | Основной язык разработки |
| Web-фреймворк | FastAPI | REST API, WebSocket, автодокументация |
| Фоновые задачи | Celery + Redis | Асинхронный запуск экспериментов |
| SAT-решатели | PySAT, CryptoMiniSat 5 | Решение SAT-задач |
| Математика | NumPy, SciPy | Вычисления, статистика |
| Данные | Pandas | Обработка результатов |
| Графики (серверные) | Matplotlib, Seaborn | Генерация графиков для отчётов |
| Тестирование | pytest, pytest-cov | Unit/integration тесты |
| C++ модули | pybind11 | Критичные по производительности модули |

### Frontend

| Компонент | Технология | Назначение |
|-----------|-----------|-----------|
| Фреймворк | React 18 | SPA-интерфейс |
| Язык | TypeScript | Типизация |
| UI-библиотека | Tailwind CSS + shadcn/ui | Компоненты интерфейса |
| Графики | Recharts / D3.js | Интерактивные графики |
| Состояние | Zustand | Управление состоянием |
| HTTP | Axios | API-запросы |
| WebSocket | native WebSocket | Real-time статус экспериментов |

### Инфраструктура

| Компонент | Технология |
|-----------|-----------|
| Контейнеризация | Docker, docker-compose |
| VCS | Git |
| CI/CD | GitHub Actions |
| Документация | Sphinx / MkDocs |

---

## 10.3 Структура репозитория (обновлённая)

```
hash-cryptanalysis/
│
├── README.md
├── docker-compose.yml
├── requirements.txt
├── pyproject.toml
│
├── docs/                          # Документация (этот каталог)
│   ├── 01-overview.md
│   ├── ...
│   └── 12-frontend.md
│
├── backend/
│   ├── main.py                    # FastAPI entrypoint
│   ├── api/
│   │   ├── routes/
│   │   │   ├── hash_functions.py
│   │   │   ├── differential.py
│   │   │   ├── sat.py
│   │   │   ├── experiments.py
│   │   │   └── results.py
│   │   ├── schemas/               # Pydantic-модели
│   │   └── dependencies.py
│   ├── core/                      # Конфигурация, безопасность
│   └── tasks/                     # Celery-задачи
│       ├── celery_app.py
│       └── experiment_tasks.py
│
├── src/                           # Core engine
│   ├── hash_functions/
│   │   ├── sha256.py
│   │   ├── sha1.py
│   │   └── md5.py
│   ├── differential/
│   │   ├── characteristics.py
│   │   ├── propagation.py
│   │   ├── probability.py
│   │   ├── conditions.py
│   │   └── search.py
│   ├── sat_encoding/
│   │   ├── cnf_builder.py
│   │   ├── bit_constraints.py
│   │   ├── word_operations.py
│   │   ├── hash_encoder.py
│   │   └── differential_constraints.py
│   ├── solver/
│   │   ├── sat_interface.py
│   │   ├── cryptominisat_runner.py
│   │   ├── pysat_runner.py
│   │   └── solution_extractor.py
│   ├── combined/
│   │   ├── sequential.py
│   │   ├── iterative.py
│   │   └── verifier.py
│   ├── analysis/
│   │   ├── result_parser.py
│   │   ├── statistics.py
│   │   └── visualization.py
│   └── utils/
│       ├── bit_operations.py
│       └── logging_config.py
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   ├── api/
│   │   ├── store/
│   │   └── types/
│   └── public/
│
├── experiments/
│   ├── configs/
│   └── results/
│
├── tests/
│   ├── test_hash_functions/
│   ├── test_differential/
│   ├── test_sat_encoding/
│   ├── test_solver/
│   └── test_combined/
│
└── notebooks/
    ├── experiment_analysis.ipynb
    └── differential_exploration.ipynb
```

---

## 10.4 API-эндпоинты (Backend)

### Hash Functions API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/hash/list` | Список доступных хэш-функций |
| POST | `/api/hash/compute` | Вычислить хэш сообщения |
| POST | `/api/hash/compare` | Сравнить хэши двух сообщений |

### Differential Analysis API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/diff/generate` | Генерация дифференциальных характеристик |
| GET | `/api/diff/characteristics/{id}` | Получить характеристику по ID |
| POST | `/api/diff/validate` | Экспериментальная валидация характеристики |

### SAT Encoding API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/sat/encode` | Закодировать задачу в CNF |
| GET | `/api/sat/cnf/{id}` | Скачать CNF-файл |
| GET | `/api/sat/stats/{id}` | Статистика CNF (переменные, клозы) |

### Experiments API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/experiments/run` | Запустить эксперимент |
| GET | `/api/experiments/{id}/status` | Статус эксперимента (WebSocket) |
| GET | `/api/experiments/{id}/results` | Результаты эксперимента |
| GET | `/api/experiments/list` | Список всех экспериментов |
| DELETE | `/api/experiments/{id}` | Удалить эксперимент |

### Results API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/results/compare` | Сравнение нескольких экспериментов |
| GET | `/api/results/charts/{type}` | Получить график (PNG/SVG) |
| GET | `/api/results/export/{format}` | Экспорт (CSV, JSON, LaTeX) |

---

## 10.5 Docker-конфигурация

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./src:/app/src
      - ./experiments:/app/experiments
    depends_on:
      - redis
    environment:
      - REDIS_URL=redis://redis:6379/0

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

  celery-worker:
    build: ./backend
    command: celery -A tasks.celery_app worker -l info -c 4
    volumes:
      - ./src:/app/src
      - ./experiments:/app/experiments
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```
