/**
 * TUI polling interval constants.
 * Tweak here to trade responsiveness vs CPU/IO load.
 */

/** Status snapshot (dashboard) — fast, drives the header indicator */
export const POLL_SNAPSHOT_MS = 800;

/** Event log live tail */
export const POLL_EVENTLOG_MS = 800;

/** Command queue panel */
export const POLL_CMDQUEUE_MS = 1000;

/** LLM calls panel */
export const POLL_LLMCALLS_MS = 1500;

/** Messages panel — chat list */
export const POLL_CHATLIST_MS = 2000;

/** Messages panel — message feed for selected chat */
export const POLL_MSGFEED_MS = 1200;
