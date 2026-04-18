-- Run this against your barrelroll-counter-db D1 database to initialise the table.
-- wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql

CREATE TABLE IF NOT EXISTS rickroll_counter (
  id    TEXT    PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Seed the row so the first hit works without an upsert edge-case.
INSERT OR IGNORE INTO rickroll_counter (id, value) VALUES ('rickrolls', 0);

-- Router reboot command queue.
-- The bridge polls this table and clears the flag after triggering a reboot.
CREATE TABLE IF NOT EXISTS router_commands (
  id           TEXT    PRIMARY KEY,
  pending      INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT
);

INSERT OR IGNORE INTO router_commands (id, pending, requested_at) VALUES ('reboot', 0, NULL);
