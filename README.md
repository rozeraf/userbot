# tg-gemini-userbot

Telegram userbot, работающий под твоим личным аккаунтом через MTProto (GramJS). Пишешь команду в любой чат — бот отвечает от твоего имени через LLM.

Поддерживает **Gemini** (Google) и **Cerebras** как провайдеры; переключаются на лету командой прямо в Telegram. Весь трафик (сообщения, вызовы LLM, события) логируется в локальную SQLite-базу через [Drizzle ORM](https://orm.drizzle.team/).

---

## Команды

| Команда | Описание |
|---|---|
| `!answer [инструкция]` | Генерирует ответ через активный LLM. Можно использовать как reply на сообщение — тогда это сообщение станет контекстом, а инструкция — инструкцией |
| `!translate [язык] [текст]` | Переводит текст. Язык: код (`ru`, `en`) или название (`русский`). Без языка — на русский |
| `!fix [текст]` | Исправляет орфографию и пунктуацию, сохраняя смысл и тон |
| `!summarize [текст]` | Создаёт краткое содержание длинного текста или reply-сообщения |
| `!explain [понятие]` | Объясняет термин или reply-сообщение простым языком |
| `!remind [время] [текст]` | Устанавливает напоминание через `@longarmraf_bot` |
| `!gemini` | Переключает активный провайдер на Gemini |
| `!cerebras` | Переключает активный провайдер на Cerebras |
| `!status` | Показывает текущий активный провайдер |
| `!help` | Показывает список всех команд |

> Бот реагирует **только на твои собственные сообщения** (`message.out`). На чужие команды не реагирует.

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
# GEMINI_API_KEYS=key-1,key-2   # несколько ключей: случайный выбор на каждый запрос
GEMINI_MODEL=gemini-2.0-flash   # опционально

CEREBRAS_API_KEY=...            # один ключ (обратная совместимость)
# CEREBRAS_API_KEYS=key-1,key-2 # несколько ключей: случайный выбор на каждый запрос
CEREBRAS_MODEL=gpt-oss-120b     # опционально

# Системный промпт (общий стиль ответов):
SYSTEM_PROMPT="Отвечай кратко и по существу."

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

---

## Структура проекта

```
src/
├── index.ts                    # Точка входа: инициализация клиента, авторизация
├── config/
│   └── env.ts                  # Валидация переменных окружения
├── core/
│   ├── db/
│   │   ├── schema.ts           # Схема таблиц (Drizzle) — единственное место правды
│   │   ├── client.ts           # SQLite + WAL + drizzle() + migrate()
│   │   ├── index.ts            # Буферизованный logging API (logMessage / logLLMCall / logEvent)
│   │   └── migrations/         # SQL-миграции, генерируются drizzle-kit
│   ├── llm/
│   │   ├── index.ts            # askCurrent() / askByProvider() + автологирование вызовов
│   │   ├── gemini.ts           # Gemini REST API (fetch + AbortController, 45s timeout)
│   │   ├── cerebras.ts         # Cerebras OpenAI-compatible API
│   │   └── prompt.ts           # buildPrompt(), normalizeText(), preview()
│   └── state.ts                # Активный провайдер — in-memory + сохранение на диск
└── modules/
    ├── events/
    │   └── onNewMessage.ts     # Роутер событий → COMMANDS, sequential command queue
    └── commands/
        ├── answer/             # !answer
        ├── explain/            # !explain
        ├── fix/                # !fix
        ├── help/               # !help
        ├── provider/           # !gemini / !cerebras
        ├── remind/             # !remind
        ├── status/             # !status
        ├── summarize/          # !summarize
        └── translate/          # !translate

drizzle.config.ts               # Конфиг drizzle-kit
```

Каждый модуль команды — изолированная папка с `init.ts` (экспортирует `CommandModule`) и файлом логики. Новая команда добавляется без правки реестра — папка подхватывается автоматически.

---

## База данных

Локальная SQLite-база `userbot.db` (не попадает в git). Схема управляется через Drizzle ORM.

### Таблицы

**`messages`** — все входящие и исходящие сообщения:

| Колонка | Тип | Описание |
|---|---|---|
| `message_id` | integer | ID сообщения в Telegram |
| `chat_id` | text | ID чата |
| `sender_id` | text | ID отправителя |
| `text` | text | Текст сообщения |
| `is_outgoing` | boolean | Исходящее (`true`) или входящее |
| `timestamp` | integer | Unix ms |

Индекс: `(chat_id, timestamp)`

**`llm_calls`** — история вызовов нейросети:

| Колонка | Тип | Описание |
|---|---|---|
| `provider` | text | `gemini` или `cerebras` |
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
bunx drizzle-kit generate

# Коммитим SQL-файл; при следующем bun start он применится автоматически
git add src/core/db/migrations/
```

Миграции применяются автоматически при старте бота через `migrate()`.

### Запросы для TUI / аналитики

```ts
import { db } from "./src/core/db/client";
import { messages, llmCalls } from "./src/core/db/schema";
import { eq, desc } from "drizzle-orm";

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
  .where(eq(llmCalls.error, null))
  .all();
```

---

## Технические детали

### Производительность записи

SQLite работает в режиме **WAL** (Write-Ahead Logging) с `synchronous = NORMAL` — это даёт параллельное чтение/запись без блокировок и высокую пропускную способность без риска потери данных при штатном завершении.

### Очередь команд

`onNewMessage` выстраивает команды в последовательную цепочку Promise (`commandQueue`). Это исключает гонку при параллельном получении нескольких команд подряд.

### Таймаут LLM

Все запросы к LLM ограничены 45 секундами через `AbortController`. При таймауте бот отправляет сообщение об ошибке в чат и продолжает работу.

### Устойчивость к сбоям

- `unhandledRejection` и `uncaughtException` перехватываются и логируются в БД, процесс не падает
- Буфер БД откатывается при ошибке транзакции, данные не теряются

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
| `SYSTEM_PROMPT` | — | `""` | Системный промпт для всех `!answer`-запросов |
| `DB_PATH` | — | `./userbot.db` | Путь к SQLite-базе |

---

## Возможные проблемы

**Бот не реагирует на команду**
— Убедись, что команда отправлена с твоего аккаунта (не от другого пользователя).
— Убедись, что текст начинается с `!` без пробела перед ним.

**Ошибка авторизации**
— Проверь `TG_API_ID` и `TG_API_HASH` на [my.telegram.org](https://my.telegram.org).
— Если сессия протухла — очисти `TG_SESSION` в `.env` и переавторизуйся.

**Ошибка от Gemini / Cerebras**
— Проверь API-ключ и лимиты запросов.
— При таймауте (>45 с) бот сам сообщит об ошибке в чат.

**`LLM_PROVIDER=gemini`, но не задан ни `GEMINI_API_KEY`, ни `GEMINI_API_KEYS`**
— Бот не запустится, выдаст ошибку при старте — это намеренно.
