import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, openSync, closeSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { configDirectory, MailboxError } from './config.mjs';

const MAX_ENTRIES = 1000;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function cacheAccount(connection) {
  return createHash('sha256').update(JSON.stringify([
    connection.config, connection.auth.user, connection.certificate,
  ])).digest('hex');
}

// Open only for synchronous local operations, so no handles survive shutdown.
export class MessageCache {
  constructor(filename = path.join(configDirectory(), 'mail-cache.sqlite'), { now = Date.now } = {}) {
    this.filename = filename;
    this.now = now;
    this.withDatabase(db => {
      db.exec(`CREATE TABLE IF NOT EXISTS messages (
        account TEXT NOT NULL, folder TEXT NOT NULL, validity TEXT NOT NULL,
        uid INTEGER NOT NULL, size INTEGER NOT NULL, fetched_at INTEGER NOT NULL,
        payload TEXT NOT NULL, PRIMARY KEY (account, folder, validity, uid)
      );
      CREATE INDEX IF NOT EXISTS messages_age ON messages(fetched_at);`);
      db.prepare('DELETE FROM messages WHERE fetched_at <= ?').run(this.now() - MAX_AGE);
    });
  }

  withDatabase(operation) {
    let db;
    try {
      mkdirSync(path.dirname(this.filename), { recursive: true, mode: 0o700 });
      try { closeSync(openSync(this.filename, 'wx', 0o600)); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      if (process.platform !== 'win32') chmodSync(this.filename, 0o600);
      db = new DatabaseSync(this.filename);
      db.exec('PRAGMA busy_timeout = 1000; PRAGMA secure_delete = ON;');
      return operation(db);
    } catch {
      throw new MailboxError('Cannot access the local mail cache. Check its file permissions; if damaged, remove mail-cache.sqlite while the server is stopped.');
    } finally { db?.close(); }
  }

  get(account, reference, size) {
    return this.withDatabase(db => {
      const row = db.prepare(`SELECT payload FROM messages
        WHERE account = ? AND folder = ? AND validity = ? AND uid = ?
        AND size = ? AND fetched_at > ?`).get(account, reference.folder,
        reference.validity, reference.uid, size, this.now() - MAX_AGE);
      return row ? JSON.parse(row.payload) : null;
    });
  }

  put(account, reference, size, message) {
    this.withDatabase(db => {
      db.exec('BEGIN IMMEDIATE');
      db.prepare('INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(account, reference.folder, reference.validity, reference.uid, size, this.now(), JSON.stringify(message));
      db.prepare('DELETE FROM messages WHERE fetched_at <= ?').run(this.now() - MAX_AGE);
      db.prepare(`DELETE FROM messages WHERE rowid IN (
        SELECT rowid FROM messages ORDER BY fetched_at DESC, rowid DESC LIMIT -1 OFFSET ?
      )`).run(MAX_ENTRIES);
      db.exec('COMMIT');
    });
  }

  invalidateFolder(account, folder, validity) {
    this.withDatabase(db => db.prepare('DELETE FROM messages WHERE account = ? AND folder = ? AND validity != ?')
      .run(account, folder, validity));
  }

  remove(account, reference) {
    this.withDatabase(db => db.prepare('DELETE FROM messages WHERE account = ? AND folder = ? AND validity = ? AND uid = ?')
      .run(account, reference.folder, reference.validity, reference.uid));
  }

  clear() {
    this.withDatabase(db => db.exec('DELETE FROM messages; VACUUM;'));
  }
}
