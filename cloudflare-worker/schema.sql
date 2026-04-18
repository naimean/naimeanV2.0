-- Run this against your barrelroll-counter-db D1 database to initialise the table.
-- wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql

CREATE TABLE IF NOT EXISTS rickroll_counter (
  id    TEXT    PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Seed the row so the first hit works without an upsert edge-case.
INSERT OR IGNORE INTO rickroll_counter (id, value) VALUES ('rickrolls', 0);
