-- Run this against your barrelroll-counter-db D1 database to initialise the tables.
-- wrangler d1 execute barrelroll-counter-db --file=cloudflare-worker/schema.sql

CREATE TABLE IF NOT EXISTS rickroll_counter (
  id    TEXT    PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Seed the row so the first hit works without an upsert edge-case.
INSERT OR IGNORE INTO rickroll_counter (id, value) VALUES ('rickrolls', 0);

-- Hotspot layout overrides saved from the in-browser layout tools.
-- Positions are stored as percentages of the chapel-wrapper dimensions so they
-- are viewport-independent and apply correctly at any window size.
-- top_pct  / height_pct → % of wrapper height
-- left_pct / width_pct  → % of wrapper width
CREATE TABLE IF NOT EXISTS layout_overrides (
  page        TEXT    NOT NULL,
  element_id  TEXT    NOT NULL,
  top_pct     REAL,
  left_pct    REAL,
  width_pct   REAL,
  height_pct  REAL,
  updated_at  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page, element_id)
);

-- Email-registered users for the bedroom switcher.
CREATE TABLE IF NOT EXISTS registered_users (
  id            TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  username      TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  created_at    INTEGER NOT NULL
);
