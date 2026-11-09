import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, 'data')
mkdirSync(dataDir, { recursive: true })

export const db = new DatabaseSync(join(dataDir, 'mind-bubble.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    machine_number INTEGER PRIMARY KEY,
    machine_type   TEXT NOT NULL DEFAULT '',
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'active',
    completed      INTEGER NOT NULL DEFAULT 0,
    created        TEXT NOT NULL,
    changed        TEXT NOT NULL,
    steps          TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS templates (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    machine_type TEXT NOT NULL DEFAULT '',
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    steps        TEXT NOT NULL DEFAULT '[]',
    created      TEXT NOT NULL
  );
`)
