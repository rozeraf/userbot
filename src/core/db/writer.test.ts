import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlinkSync } from "fs";

const dbPath = `/tmp/tg-userbot-writer-${process.pid}.db`;
process.env.DB_PATH = dbPath;

let database: typeof import("./index").database;
let db: typeof import("./client").db;
let schema: typeof import("./schema");
let writeTransaction: typeof import("./writer").writeTransaction;

function revision(resource: string, scope = ""): number {
  return db.select().from(schema.tuiRevisions).all()
    .find((row) => row.resource === resource && row.scope === scope)?.revision ?? 0;
}

beforeAll(async () => {
  ({ database } = await import("./index"));
  ({ db } = await import("./client"));
  schema = await import("./schema");
  ({ writeTransaction } = await import("./writer"));
});

afterAll(() => {
  database.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(`${dbPath}${suffix}`); } catch { /* already absent */ }
  }
});

describe("DB writer revisions", () => {
  test("one batch bumps each chat scope and chats only once", () => {
    for (let id = 1; id <= 40; id++) {
      database.logMessage({ messageId: id, chatId: "A", text: `a${id}`, isOutgoing: false });
    }
    database.logMessage({ messageId: 1, chatId: "B", text: "b", isOutgoing: false });
    expect(database.flush(true)).toBeTrue();
    expect(revision("messages", "A")).toBe(1);
    expect(revision("messages", "B")).toBe(1);
    expect(revision("chats")).toBe(1);
  });

  test("duplicate insert does not bump projections", () => {
    const beforeMessages = revision("messages", "A");
    const beforeChats = revision("chats");
    database.updateSnapshot();
    const beforeIncoming = db.select().from(schema.statusSnapshot).all()[0]?.incomingCount;
    database.logMessage({ messageId: 1, chatId: "A", text: "duplicate", isOutgoing: false });
    database.flush(true);
    database.updateSnapshot();
    expect(revision("messages", "A")).toBe(beforeMessages);
    expect(revision("chats")).toBe(beforeChats);
    expect(db.select().from(schema.statusSnapshot).all()[0]?.incomingCount).toBe(beforeIncoming);
  });

  test("bulk message epoch is independent from chat scopes", () => {
    const beforeGlobal = revision("messages");
    const beforeScoped = revision("messages", "A");
    writeTransaction((_tx, changed) => changed.mark("messages"));
    expect(revision("messages")).toBe(beforeGlobal + 1);
    expect(revision("messages", "A")).toBe(beforeScoped);
  });

  test("rollback also rolls back revisions", () => {
    const before = revision("events");
    expect(() => writeTransaction((_tx, changed) => {
      changed.mark("events");
      throw new Error("rollback");
    })).toThrow("rollback");
    expect(revision("events")).toBe(before);
  });

  test("immediate command writes invalidate only commands", () => {
    const beforeCommands = revision("commands");
    const beforeMessages = revision("messages", "A");
    expect(database.beginCommand({
      chatId: "A", messageId: 999, commandName: "test", correlationId: "corr", provider: "gemini",
    })).toBeTrue();
    database.finishCommand("A", 999, "succeeded");
    expect(revision("commands")).toBe(beforeCommands + 2);
    expect(revision("messages", "A")).toBe(beforeMessages);
  });
});
