# Jarvis Userbot

Jarvis — Telegram-юзербот, работающий под твоим личным аккаунтом через MTProto (GramJS). Пишешь команду в любой чат — Jarvis отвечает от твоего имени через LLM.

Поддерживает **Gemini** (Google) и **Cerebras** как провайдеры; переключаются на лету командой прямо в Telegram. Весь трафик (сообщения, вызовы LLM, события) логируется в локальную SQLite-базу через [Drizzle ORM](https://orm.drizzle.team/).

Документы проекта: [правила разработки](CONTRIBUTING.md), [roadmap](todo.md), [Jarvis Workspace](docs/workspace.md), [синхронизация TUI](docs/tui-sync.md).

## Быстрый старт

```bash
bun install
cp .env.example .env
# заполнить TG_API_ID, TG_API_HASH и ключ активного LLM-провайдера
bun start
```

В другом терминале можно открыть read-only мониторинг:

```bash
bun run tui
```

## Команды

| Команда | Описание |
|---|---|
| `.ai [инструкция]` | Генерирует ответ через активный LLM. Можно использовать как reply на сообщение — тогда это сообщение станет контекстом, а инструкция — инструкцией |
| `.translate [язык] [текст]` | Переводит текст. Язык: код (`ru`, `en`) или название (`русский`). Без языка — на русский |
| `.fix [текст]` | Исправляет орфографию и пунктуацию, сохраняя смысл и тон |
| `.find [запрос]` | Ищет сообщения в локальной истории без обращения к LLM |
| `.person @username [вопрос]` | Анализирует сообщения выбранного автора с привязкой к evidence |
| `.searchclaim [утверждение]` | Проверяет утверждение по локальной истории |
| `.summarize [текст]` | Создаёт краткое содержание длинного текста или reply-сообщения |
| `.explain [понятие]` | Объясняет термин или reply-сообщение простым языком |
| `.remind <время> <текст>` | Создаёт scheduled message в «Избранном»; единицы: `s`, `m`, `h`, `d` |
| `.gemini` | Переключает активный провайдер на Gemini |
| `.cerebras` | Переключает активный провайдер на Cerebras |
| `.status` | Показывает текущий активный провайдер |
| `.help` | Показывает список всех команд |

> Бот реагирует **только на твои собственные сообщения** (`message.out`). На чужие команды не реагирует.

После первого авторизованного запуска бот также создаёт приватный forum
`Jarvis Workspace`. В его топике `Chat` можно писать без command prefix;
`Saved` и `Media` работают как тихие хранилища, `Settings` принимает явные
`.commands`, а `System` — ошибки и служебные уведомления. Подробности — в
[docs/workspace.md](docs/workspace.md).

---

## Требования

- [Bun](https://bun.sh/) ≥ 1.0
- Telegram-аккаунт + `api_id` / `api_hash` с [my.telegram.org](https://my.telegram.org)
- API-ключ Gemini ([Google AI Studio](https://aistudio.google.com/)) и/или Cerebras

---

## Установка и запуск

### 1. Клонировать и установить зависимости

```bash
git clone <repo>
cd userbot
bun install
```

### 2. Получить Telegram API credentials

1. Зайти на [my.telegram.org](https://my.telegram.org) и авторизоваться
2. Открыть раздел **API development tools**
3. Создать приложение — получить `api_id` и `api_hash`

### 3. Заполнить `.env`

Скопировать `.env.example` в `.env`:

```bash
cp .env.example .env
```

Заполнить:

```env
TG_API_ID=12345678
TG_API_HASH=abcdef1234567890abcdef1234567890

# LLM — выбрать один провайдер по умолчанию:
LLM_PROVIDER=gemini          # или cerebras

GEMINI_API_KEY=...              # один ключ (обратная совместимость)
# GEMINI_API_KEYS=key-1,key-2   # несколько ключей: ротация при временной ошибке
GEMINI_MODEL=gemini-2.0-flash   # опционально

CEREBRAS_API_KEY=...            # один ключ (обратная совместимость)
# CEREBRAS_API_KEYS=key-1,key-2 # несколько ключей: ротация при временной ошибке
CEREBRAS_MODEL=gpt-oss-120b     # опционально

# Необязательно: число дней хранения приватных журналов. 0 = бессрочно.
DB_RETENTION_DAYS=0
DB_PATH=./userbot.db

# Имя экземпляра разделяет TUI sockets при запуске нескольких ботов.
USERBOT_INSTANCE=default

# Системный промпт (общий стиль ответов):
SYSTEM_PROMPT="Отвечай кратко и по существу."

# Максимальный размер пользовательского промпта в графемах; 0 отключает лимит.
MAX_LLM_PROMPT_GRAPHEMES=30000
SEMANTIC_SEARCH_ENABLED=false # opt-in: индексирует приватную историю через Gemini Embeddings
TG_PING_INTERVAL_SECONDS=180  # 0 отключает активный Telegram health-check
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768

# После первой авторизации заполняется автоматически:
TG_SESSION=

```

### 4. Первый запуск (авторизация)

```bash
bun run index.ts
```

Бот запросит номер телефона и код из Telegram. После успешной авторизации в консоль выведется `TG_SESSION` — вставить его в `.env`. Повторная авторизация больше не потребуется.

### 5. Последующие запуски

```bash
bun start
```

Перед коммитом или обновлением сервиса:

```bash
bun run check
git diff --check
```

### Запуск через systemd (user service)

Unit предполагает clone в `~/projects/userbot`. Для другого расположения измени
`WorkingDirectory`, `EnvironmentFile` и `ExecStart`. Убедись, что `.env` заполнен
и доступен только владельцу:

```bash
mkdir -p ~/.config/systemd/user
cp systemd/tg-userbot.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now tg-userbot
```

Проверка и просмотр логов:

```bash
systemctl --user status tg-userbot
journalctl --user -u tg-userbot -f
```

Чтобы сервис продолжал работать после logout, один раз выполни
`loginctl enable-linger "$USER"`.

---

## Структура проекта

```
src/
├── index.ts                    # Точка входа: инициализация клиента, авторизация
├── config/
│   ├── commands.ts             # COMMAND_PREFIX и helpers синтаксиса команд
│   └── env.ts                  # Валидация переменных окружения
├── core/
│   ├── db/
│   │   ├── schema.ts           # Схема таблиц (Drizzle) — единственное место правды
│   │   ├── client.ts           # SQLite + WAL + drizzle() + migrate()
│   │   ├── writer.ts           # Единая transaction boundary + TUI revisions
│   │   ├── index.ts            # Буферизованный logging API
│   │   └── migrations/         # SQL-миграции, генерируются drizzle-kit
│   ├── llm/
│   │   ├── index.ts            # askCurrent() / askByProvider() + автологирование вызовов
│   │   ├── gemini.ts           # Gemini REST API (fetch + AbortController, 45s timeout)
│   │   ├── cerebras.ts         # Cerebras OpenAI-compatible API
│   │   └── prompt.ts           # buildPrompt(), normalizeText(), preview()
│   ├── tuiSync/                # Coalesced UDS wake protocol для read-only TUI
│   └── state.ts                # Активный провайдер — in-memory + сохранение на диск
└── modules/
    ├── events/
    │   └── onNewMessage.ts     # Роутер событий → COMMANDS, sequential command queue
    └── commands/
        ├── ai/                 # .ai
        ├── explain/            # .explain
        ├── fix/                # .fix
        ├── help/               # .help
        ├── provider/           # .gemini / .cerebras
        ├── remind/             # .remind
        ├── status/             # .status
        ├── summarize/          # .summarize
        └── translate/          # .translate

drizzle.config.ts               # Конфиг drizzle-kit
tui/                            # Ink TUI: projections, revisions, panels
docs/                           # Архитектурные документы
systemd/                        # Шаблон user service
```

Каждый модуль команды — изолированная папка с `init.ts` (экспортирует `CommandModule`) и файлом логики. Новую команду нужно явно добавить в `src/modules/commands/index.ts`: это фиксирует порядок сопоставления и не позволяет незаметно пропустить ошибку загрузки.

---

## База данных

Локальная SQLite-база `userbot.db` (не попадает в git). Схема управляется через Drizzle ORM.

### Таблицы

**`messages`** — все входящие и исходящие сообщения:

| Колонка | Тип | Описание |
|---|---|---|
| `message_id` | integer | ID сообщения в Telegram; уникален вместе с `chat_id` |
| `chat_id` | text | ID чата |
| `sender_id` | text | ID отправителя |
| `text` | text | Текст сообщения |
| `is_outgoing` | boolean | Исходящее (`true`) или входящее |
| `timestamp` | integer | Локальное время журналирования, Unix ms |
| `telegram_timestamp` | integer | Время сообщения Telegram, Unix ms |

Индекс: `(chat_id, timestamp)`

**`llm_calls`** — история вызовов нейросети:

| Колонка | Тип | Описание |
|---|---|---|
| `provider` | text | `gemini` или `cerebras` |
| `model` | text | Использованная модель |
| `correlation_id` | text | Связь с событием выполнения команды |
| `prompt` | text | Полный промпт |
| `response` | text | Ответ модели (null при ошибке) |
| `latency_ms` | integer | Время ответа, мс |
| `error` | text | Сообщение об ошибке (null при успехе) |
| `timestamp` | integer | Unix ms |

**`event_log`** — системные события:

| Колонка | Тип | Описание |
|---|---|---|
| `event_type` | text | `bot_start`, `command_start`, `command_error`, `provider_changed`, … |
| `level` | text | `info` / `warn` / `error` |
| `message` | text | Описание события |
| `metadata` | text | JSON с дополнительными данными |
| `timestamp` | integer | Unix ms |

### Запись

Записи **буферизуются в памяти** и сбрасываются на диск пакетными транзакциями (batch insert):
- при накоплении ≥ 50 записей
- по таймеру раз в секунду
- при завершении процесса (`SIGINT`, `SIGTERM`, `exit`)

### Миграции

При изменении схемы:

```bash
# Сгенерировать миграцию из изменений в schema.ts
bun run db:generate

# Коммитим SQL-файл; при следующем bun start он применится автоматически
git add src/core/db/migrations/
```

Уже применённые миграции не редактируются — любое исправление оформляется новой
миграцией.

Миграции применяются автоматически при старте бота через `migrate()`.

### Запросы для TUI / аналитики

```ts
import { db } from "./src/core/db/client";
import { messages, llmCalls } from "./src/core/db/schema";
import { eq, desc, isNotNull } from "drizzle-orm";

// Последние 50 сообщений из чата
db.select()
  .from(messages)
  .where(eq(messages.chatId, "-100123456789"))
  .orderBy(desc(messages.timestamp))
  .limit(50)
  .all();

// Все неудачные вызовы LLM
db.select()
  .from(llmCalls)
  .where(isNotNull(llmCalls.error))
  .all();
```

---

## Технические детали

Подробный протокол актуализации панелей описан в [docs/tui-sync.md](docs/tui-sync.md).

### Производительность записи

SQLite работает в режиме **WAL** с `synchronous = FULL`: запись немного дороже, зато при сбое питания не теряются уже подтверждённые транзакции. Буфер журналов всё ещё может потерять записи, не успевшие попасть в БД; критически важное выполнение команды фиксируется отдельно до вызова LLM.

### Очередь команд

Команды одного чата выполняются последовательно; медленный запрос в одном чате не блокирует команды в других чатах.

### Таймаут LLM

Одиночный запрос к LLM ограничен 45 секундами. `.ai` может выполнять до трёх раундов read-only инструментов, но весь цикл имеет единый бюджет 60 секунд. Если поиск уже вернул evidence, а финальный model turn не успел завершиться, бот показывает найденные сообщения без самостоятельной интерпретации.

### Устойчивость к сбоям

- `unhandledRejection` логируется; `uncaughtException` сначала сохраняется в журнал, затем процесс корректно завершается
- При ошибке транзакции буфер возвращается в память и повторяет запись с экспоненциальной задержкой

---

## Переменные окружения

| Переменная | Обязательна | По умолчанию | Описание |
|---|---|---|---|
| `TG_API_ID` | ✓ | — | Telegram App ID |
| `TG_API_HASH` | ✓ | — | Telegram App Hash |
| `TG_SESSION` | — | `""` | Сохранённая сессия (заполняется после первого входа) |
| `LLM_PROVIDER` | — | `gemini` | Провайдер по умолчанию: `gemini` или `cerebras` |
| `GEMINI_API_KEY` / `GEMINI_API_KEYS` | если `gemini` | — | Один ключ или список ключей через запятую/новую строку |
| `GEMINI_MODEL` | — | `gemini-2.0-flash` | Модель Gemini |
| `CEREBRAS_API_KEY` / `CEREBRAS_API_KEYS` | если `cerebras` | — | Один ключ или список ключей через запятую/новую строку |
| `CEREBRAS_MODEL` | — | `gpt-oss-120b` | Модель Cerebras |
| `SYSTEM_PROMPT` | — | `""` | Общий системный промпт для всех LLM-команд; правила конкретной команды добавляются после него |
| `MAX_LLM_PROMPT_GRAPHEMES` | — | `30000` | Максимальная длина пользовательского промпта в графемах; `0` отключает лимит |
| `DB_RETENTION_DAYS` | — | `0` | Срок хранения локальных журналов в днях; `0` отключает автоматическое удаление |
| `SEMANTIC_SEARCH_ENABLED` | — | `false` | Включить отправку сообщений в Gemini Embeddings и гибридный semantic+FTS поиск |
| `TG_PING_INTERVAL_SECONDS` | — | `180` | Интервал активной проверки Telegram; `0` полностью отключает периодический API-вызов |
| `GEMINI_EMBEDDING_MODEL` | — | `gemini-embedding-001` | Text embedding model для локального семантического индекса |
| `EMBEDDING_DIMENSIONS` | — | `768` | Размерность сохраняемых embedding-векторов |
| `DB_PATH` | — | `./userbot.db` | Путь к SQLite-базе |
| `USERBOT_INSTANCE` | — | `default` | Имя локального экземпляра для отдельного TUI socket (`A-Z`, `a-z`, `0-9`, `_`, `-`) |

---

## Возможные проблемы

**Бот не реагирует на команду**
— Убедись, что команда отправлена с твоего аккаунта (не от другого пользователя).
— Убедись, что текст начинается с `.` без пробела перед ним.

**Ошибка авторизации**
— Проверь `TG_API_ID` и `TG_API_HASH` на [my.telegram.org](https://my.telegram.org).
— Если сессия протухла — очисти `TG_SESSION` в `.env` и переавторизуйся.

**Ошибка от Gemini / Cerebras**
— Проверь API-ключ и лимиты запросов.
— При таймауте (>45 с) бот сам сообщит об ошибке в чат.

**`LLM_PROVIDER=gemini`, но не задан ни `GEMINI_API_KEY`, ни `GEMINI_API_KEYS`**
— Бот не запустится, выдаст ошибку при старте — это намеренно.
