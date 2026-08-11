# Разработка Jarvis Userbot

## Рабочий цикл

1. Перед изменениями проверить `git status --short` и не трогать чужие незавершённые файлы.
2. Делать одну логическую задачу за коммит. Рефакторинг не смешивать с изменением поведения без необходимости.
3. Добавлять или обновлять тесты для исправлений и новой логики.
4. Перед коммитом запускать:

   ```bash
   bun run check
   git diff --check
   git diff --stat
   ```

5. Просмотреть staged diff через `git diff --cached`, затем убедиться, что `git status --short` не содержит случайных файлов.

## Коммиты

Используется короткий Conventional Commits-стиль:

```text
feat(scope): add behavior
fix(scope): correct behavior
refactor(scope): restructure without behavior change
test(scope): add or improve tests
docs: improve documentation
chore: maintain tooling or repository
```

Не коммитить `.env`, Telegram session, SQLite/WAL-файлы, локальный provider state, логи и экспорт приватной переписки. Секрет, однажды попавший в Git, нужно считать скомпрометированным даже после удаления файла.

## Definition of Done

Задача считается готовой, когда:

- поведение реализовано и проверено на основном и ошибочном сценариях;
- `bun run check` проходит;
- документация и `.env.example` отражают новые настройки;
- изменение схемы сопровождается миграцией и её metadata;
- в staged diff нет секретов, БД, временных файлов и несвязанных изменений;
- roadmap обновлён, если изменился статус пользовательской задачи.

## База данных и миграции

`src/core/db/schema.ts` — источник истины. После изменения схемы:

```bash
bun run db:generate
bun run check
git status --short
```

SQL и Drizzle metadata коммитятся вместе со схемой. Уже выпущенные миграции не редактируются: исправление оформляется новой миграцией. Runtime-запись должна проходить через `writeTransaction()`, чтобы domain state и TUI revisions изменялись атомарно.

## Telegram-команды

Prefix и операции над синтаксисом централизованы в `src/config/commands.ts`. Новые команды должны использовать `commandText()`, `matchesCommand()` и `commandArgs()` вместо строковых литералов вроде `".command"`. Пользовательские примеры в README и roadmap обновляются вместе с изменением prefix.

## Ветки и выпуск

- `main` должна оставаться запускаемой; незавершённую крупную работу вести в короткой feature-ветке.
- Перед обновлением user service сохранить резервную копию БД и проверить миграции.
- После обновления выполнить `systemctl --user restart tg-userbot` и проверить `systemctl --user status tg-userbot` и журнал.
- Не переписывать опубликованную историю `main` без явной причины и согласования.

## Где фиксировать работу

Пользовательские планы хранятся в [todo.md](todo.md). Архитектурные правила TUI находятся в [docs/tui-sync.md](docs/tui-sync.md). Завершённые задачи удаляются из активной очереди roadmap и кратко переносятся в раздел «Готово».
