import test from 'node:test';
import assert from 'node:assert/strict';
import { MailboxService } from '../src/mailbox.mjs';
import { startImap } from './imap-fixture.mjs';

test('real TLS IMAP connection supports folders, paged search and read without mutations', async t => {
  const fixture = await startImap(); t.after(() => fixture.close());
  const service = new MailboxService(async () => fixture.connection);
  assert.equal((await service.status()).connected, true);
  assert.equal((await service.folders()).folders[0].path, 'INBOX');
  const first = await service.search({ limit: 1 });
  assert.equal(first.messages[0].subject, 'Second message');
  assert.ok(first.next_cursor);
  const second = await service.search({ limit: 1, cursor: first.next_cursor });
  assert.equal(second.messages[0].subject, 'First message');
  assert.equal(second.next_cursor, null);
  const message = await service.read({ message_id: first.messages[0].message_id });
  assert.match(message.text, /Hello from the simulated mailbox/);
  assert.equal(message.untrusted, true);
  assert.ok(fixture.commands.some(c => /EXAMINE/.test(c)));
  assert.ok(fixture.commands.some(c => /BODY\.PEEK/.test(c)));
  assert.ok(!fixture.commands.some(c => /\b(SELECT|STORE|APPEND|EXPUNGE|MOVE|COPY|DELETE)\b/.test(c)));
});

test('required STARTTLS works against a local IMAP server', async t => {
  const fixture = await startImap({ starttls: true }); t.after(() => fixture.close());
  const service = new MailboxService(async () => fixture.connection);
  assert.equal((await service.status()).connected, true);
  assert.ok(fixture.commands.some(c => /STARTTLS/.test(c)));
});

test('rejects wrong certificates and does not leak credentials in errors', async t => {
  const fixture = await startImap(); t.after(() => fixture.close());
  const other = await startImap(); t.after(() => other.close());
  const service = new MailboxService(async () => ({ ...fixture.connection, certificate: other.connection.certificate }));
  await assert.rejects(service.status(), error => /certificate|TLS/.test(error.message) && !error.message.includes('fixture-password'));
});

test('the certificate fingerprint is also enforced on the STARTTLS upgrade', async t => {
  const fixture = await startImap({ starttls: true }); t.after(() => fixture.close());
  const other = await startImap(); t.after(() => other.close());
  const service = new MailboxService(async () => ({ ...fixture.connection, certificate: other.connection.certificate }));
  await assert.rejects(service.status(), error => /certificate|TLS/.test(error.message) && !error.message.includes('fixture-password'));
});

test('a server that stops advertising STARTTLS fails instead of downgrading to plaintext', async t => {
  const fixture = await startImap({ starttls: true, advertiseStarttls: false });
  t.after(() => fixture.close());
  const service = new MailboxService(async () => fixture.connection);
  await assert.rejects(service.status());
  assert.ok(!fixture.commands.some(c => /^(LOGIN|AUTHENTICATE)/i.test(c)), 'credentials must not be sent over plaintext');
});

test('invalid arguments fail before opening a connection', async () => {
  const service = new MailboxService(async () => { throw new Error('should not connect'); });
  await assert.rejects(service.search({ limit: 999 }), /Invalid/);
  await assert.rejects(service.search({ folder: 'INBOX\r\nDELETE INBOX' }), /Invalid/);
  await assert.rejects(service.read({ message_id: '../../vault.json' }), /Invalid/);
  await assert.rejects(service.search({ command: 'DELETE' }), /Invalid/);
});

test('stale IDs, query-mismatched cursors and oversized messages are refused', async t => {
  const fixture = await startImap(); t.after(() => fixture.close());
  const service = new MailboxService(async () => fixture.connection);
  const page = await service.search({ limit: 1 });
  await assert.rejects(service.search({ subject: 'changed', cursor: page.next_cursor }), /cursor/i);
  fixture.state.validity = 2;
  await assert.rejects(service.read({ message_id: page.messages[0].message_id }), /changed|again/);
  fixture.state.validity = 1;
  fixture.state.oversized = true;
  const bodyFetches = fixture.commands.filter(c => /BODY\.PEEK/.test(c)).length;
  await assert.rejects(service.read({ message_id: page.messages[0].message_id }), /2 MiB/);
  assert.equal(fixture.commands.filter(c => /BODY\.PEEK/.test(c)).length, bodyFetches);
});
