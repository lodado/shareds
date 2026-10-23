import { STAGES } from '../machine/machine.ts'
import { RUN_STATES } from '../run/run.ts'

// Bump this whenever anything below changes. That includes the stage list, because the CHECK on items.stage is
// built from it; a database made for an older list must be migrated, not opened.
export const SCHEMA_VERSION = 1

export const EVENT_KINDS = ['item_created', 'item_event', 'inbound', 'outbound', 'run', 'system'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

const EVENT_KIND_SET: ReadonlySet<string> = new Set(EVENT_KINDS)
export const isEventKind = (value: unknown): value is EventKind =>
  typeof value === 'string' && EVENT_KIND_SET.has(value)

const RUN_KINDS = ['plan', 'build'] as const
export type RunKind = (typeof RUN_KINDS)[number]

const RUN_KIND_SET: ReadonlySet<string> = new Set(RUN_KINDS)
export const isRunKind = (value: unknown): value is RunKind => typeof value === 'string' && RUN_KIND_SET.has(value)

export const ITEM_SOURCES = ['mention', 'dm'] as const
export type ItemSource = (typeof ITEM_SOURCES)[number]

const ITEM_SOURCE_SET: ReadonlySet<string> = new Set(ITEM_SOURCES)
export const isItemSource = (value: unknown): value is ItemSource =>
  typeof value === 'string' && ITEM_SOURCE_SET.has(value)

const quoted = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ')

// events is append-only: a trigger refuses any update or delete, so the log can be trusted as a record.
// (openStore also turns recursive_triggers on, otherwise INSERT OR REPLACE would skip the delete trigger.)
export const SCHEMA = `
CREATE TABLE items (
  key TEXT PRIMARY KEY,
  thread_key TEXT NOT NULL,
  repo TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN (${quoted(STAGES)})),
  -- where the work came from: someone else's mention (needs a digest approval) or the owner's own DM prompt
  source TEXT NOT NULL CHECK (source IN (${quoted(ITEM_SOURCES)})),
  -- what to do in this repo, from the owner's DM prompt; empty for a mention
  task TEXT NOT NULL,
  -- what the digest shows about it (summary, thread link, routing reason, urgent), as JSON
  meta TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (thread_key, repo)
);
CREATE INDEX items_by_stage ON items(stage);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  item_key TEXT REFERENCES items(key),
  kind TEXT NOT NULL CHECK (kind IN (${quoted(EVENT_KINDS)})),
  type TEXT NOT NULL,
  stage_before TEXT,
  stage_after TEXT,
  outcome TEXT,
  reason TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX events_by_item ON events(item_key, id);
CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events is append-only'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events is append-only'); END;

CREATE TABLE cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key TEXT NOT NULL REFERENCES items(key),
  kind TEXT NOT NULL CHECK (kind IN ('assign', 'plan')),
  created_at TEXT NOT NULL,
  -- where the card DM was posted (channel:ts), so a reply in its thread can be matched to the item
  slack_ref TEXT
);
CREATE INDEX cards_by_item ON cards(item_key, kind, id);

-- The place an item is worked in. One claude session runs from the plan to the build, so the plan is still in
-- context when the code is written.
CREATE TABLE workspaces (
  item_key TEXT PRIMARY KEY REFERENCES items(key),
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_ref TEXT NOT NULL,
  plan TEXT NOT NULL,
  pr_url TEXT
);

-- One row per agent run. A run is stored from the moment it is decided on, never as 'requested': an admitted one as
-- running, a refused one as rejected. An item has at most one run in progress.
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key TEXT NOT NULL REFERENCES items(key),
  kind TEXT NOT NULL CHECK (kind IN (${quoted(RUN_KINDS)})),
  state TEXT NOT NULL CHECK (state IN (${quoted(RUN_STATES)})),
  cost_usd REAL NOT NULL,
  detail TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX runs_one_active ON runs(item_key) WHERE state IN ('requested', 'running');
CREATE INDEX runs_by_state ON runs(state);

-- A digest is one DM that lists the new items. An item is listed in at most one digest, which is what makes the
-- next digest hold only what is new.
CREATE TABLE digests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  slack_ref TEXT
);
CREATE TABLE digest_items (
  digest_id INTEGER NOT NULL REFERENCES digests(id),
  item_key TEXT NOT NULL UNIQUE REFERENCES items(key),
  PRIMARY KEY (digest_id, item_key)
);
`
