import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { MessageCache, cacheAccount } from '../src/cache.mjs';
import { MailboxService } from '../src/mailbox.mjs';
import { decodeMessageId } from '../src/config.mjs';
import { startImap } from './imap-fixture.mjs';

async function cacheFile(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'proton-cache-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return path.join(directory, 'mail-cache.sqlite');
}

test('SQLite persists across instances, isolates accounts/folders/validity and expires entries', async t => {
  const filename = await cacheFile(t);
  let now = 100;
  const cache = new MessageCache(filename, { now: () => now });
  const ref = { folder: 'INBOX', validity: '1', uid: 2 };
  const message = { untrusted: true, text: "Email's body" };
  cache.put('account-a', ref, 50, message);
  assert.deepEqual(new MessageCache(filename, { now: () => now }).get('account-a', ref, 50), message);
  assert.equal(cache.get('account-b', ref, 50), null);
  assert.equal(cache.get('account-a', { ...ref, folder: 'Sent' }, 50), null);
  assert.equal(cache.get('account-a', { ...ref, validity: '2' }, 50), null);
  assert.equal(cache.get('account-a', ref, 51), null);
  if (process.platform !== 'win32') assert.equal((await stat(filename)).mode & 0o777, 0o600);
  now += 30 * 24 * 60 * 60 * 1000;
  assert.equal(cache.get('account-a', ref, 50), null);
  cache.put('account-a', ref, 50, message);
  cache.clear();
  assert.equal(cache.get('account-a', ref, 50), null);
});

test('repeat reads skip body downloads across service restarts but validate deleted and stale mail', async t => {
  const filename = await cacheFile(t);
  const fixture = await startImap(); t.after(() => fixture.close());
  const provider = async () => fixture.connection;
  const cache = new MessageCache(filename);
  const service = new MailboxService(provider, cache);
  const page = await service.search({ limit: 1 });
  const input = { message_id: page.messages[0].message_id };
  const first = await service.read(input);
  const downloads = () => fixture.commands.filter(c => /BODY\.PEEK/.test(c)).length;
  assert.equal(downloads(), 1);
  assert.deepEqual(await new MailboxService(provider, new MessageCache(filename)).read(input), first);
  assert.equal(downloads(), 1);
  const otherAccount = new MailboxService(async () => ({ ...fixture.connection,
    auth: { ...fixture.connection.auth, user: 'different-user' } }), cache);
  await otherAccount.read(input);
  assert.equal(downloads(), 2, 'another account must download its own message');
  fixture.state.oversized = true;
  await assert.rejects(service.read(input), /2 MiB/);
  fixture.state.oversized = false;
  fixture.state.validity = 2;
  await assert.rejects(service.read(input), /Mailbox changed/);
  const ref = decodeMessageId(input.message_id);
  assert.equal(cache.get(cacheAccount(fixture.connection), ref, page.messages[0].size_bytes), null);
  fixture.state.validity = 1;
  await service.read(input);
  assert.equal(downloads(), 3);
  fixture.state.deleted = true;
  await assert.rejects(service.read(input), /no longer exists/);
  assert.equal(cache.get(cacheAccount(fixture.connection), ref, page.messages[0].size_bytes), null);
  assert.ok(!fixture.commands.some(c => /\b(SELECT|STORE|APPEND|EXPUNGE|MOVE|COPY|DELETE)\b/.test(c)));
});

test('cache evicts older entries after reaching its 1000-message bound', async t => {
  let now = 1;
  const cache = new MessageCache(await cacheFile(t), { now: () => now++ });
  const ref = { folder: 'INBOX', validity: '1', uid: 1 };
  for (let uid = 1; uid <= 1001; uid++) cache.put('account', { ...ref, uid }, 10, { text: String(uid) });
  assert.equal(cache.get('account', ref, 10), null);
  assert.deepEqual(cache.get('account', { ...ref, uid: 1001 }, 10), { text: '1001' });
});

test('cache-clear CLI clears the database without a Bridge connection or vault', async t => {
  const filename = await cacheFile(t);
  const cache = new MessageCache(filename);
  const ref = { folder: 'INBOX', validity: '1', uid: 1 };
  cache.put('account', ref, 10, { text: 'cached email' });
  const { stdout } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), 'cache-clear'],
    { windowsHide: true, env: { ...process.env, PROTONMAIL_MCP_CONFIG_DIR: path.dirname(filename), PROTONMAIL_MCP_PASSPHRASE: '' } });
  assert.match(stdout, /Local email cache cleared/);
  assert.equal(cache.get('account', ref, 10), null);
});

test('damaged cache errors give recovery instructions without exposing stored content', async t => {
  const filename = await cacheFile(t);
  await writeFile(filename, 'sensitive email content, not a database');
  assert.throws(() => new MessageCache(filename), error =>
    /Cannot access the local mail cache/.test(error.message) && !error.message.includes('sensitive email'));
});
