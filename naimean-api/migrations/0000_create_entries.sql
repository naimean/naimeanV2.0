-- Run this against your naimean-db D1 database to initialise the table.
-- wrangler d1 execute naimean-db --file=naimean-api/migrations/0000_create_entries.sql

CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  title      TEXT     NOT NULL,
  content    TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
