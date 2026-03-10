# Combined Differential–SAT Cryptanalysis of Hash Functions

**Исследование и разработка комбинированного метода криптоанализа хэш-функций на основе дифференциальных характеристик и SAT-решателей**

Магистерская ВКР | 09.04.01 — Информатика и вычислительная техника

---

## Описание

Система для комбинированного криптоанализа хэш-функций (SHA-256, SHA-1), объединяющая дифференциальный анализ и SAT-решатели. Включает веб-интерфейс для настройки экспериментов, мониторинга и визуализации результатов.

## Архитектура

```
Frontend (React + TypeScript)  ←→  Backend API (FastAPI)  ←→  Core Engine (Python)
                                         ↕
                                   SAT-решатели (CryptoMiniSat, MiniSAT, Glucose)
```

## Документация модулей

| # | Документ | Описание |
|---|----------|----------|
| 1 | [Обзор проекта](docs/01-overview.md) | Цели, задачи, научная новизна, практическая значимость |
| 2 | [Теоретические основы](docs/02-theoretical-background.md) | Дифференциальный криптоанализ, SAT, CDCL, комбинированный подход |
| 3 | [Целевые хэш-функции](docs/03-target-hash-functions.md) | SHA-256, SHA-1: структура, раундовые функции, известные атаки |
| 4 | [Дифференциальный анализ](docs/04-differential-analysis.md) | Структуры данных, правила распространения, алгоритм генерации характеристик |
| 5 | [SAT-кодирование](docs/05-sat-encoding.md) | CNF-кодирование операций (XOR, AND, модульное сложение), кодирование раундов |
| 6 | [Интеграция SAT-решателей](docs/06-solver-integration.md) | Интерфейс решателей, CryptoMiniSat, PySAT, инкрементальный режим |
| 7 | [Комбинированный алгоритм](docs/07-combined-algorithm.md) | Три стратегии (Sequential, Iterative, Hybrid), оптимизации |
| 8 | [Экспериментальная часть](docs/08-experimental-framework.md) | 5 экспериментов, параметры, конфигурации |
| 9 | [Анализ результатов](docs/09-result-analysis.md) | Метрики, статистика, визуализации, интерпретация |
| 10 | [Архитектура и стек](docs/10-architecture.md) | Backend/Frontend стек, API-эндпоинты, Docker, структура репозитория |
| 11 | [Тестирование](docs/11-testing-and-reproducibility.md) | Unit/integration тесты, воспроизводимость |
| 12 | [Веб-интерфейс](docs/12-frontend.md) | UI-страницы, компоненты, WebSocket, визуализация |

## Быстрый старт

```bash
# Backend
pip install -r requirements.txt
uvicorn backend.main:app --reload

# Frontend
cd frontend && npm install && npm run dev

# Docker (всё вместе)
docker-compose up
```

## Стек технологий

**Backend:** Python 3.11+, FastAPI, Celery, PySAT, CryptoMiniSat, NumPy, Pandas, Matplotlib

**Frontend:** React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts, D3.js

**Инфраструктура:** Docker, Redis, pytest
