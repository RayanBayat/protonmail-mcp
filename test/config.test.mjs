import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, encodeMessageId, decodeMessageId } from '../src/config.mjs';

test('configuration only allows loopback and encrypted IMAP', () => {
  const valid = { version: 1, host: '127.0.0.1', port: 1143, security: 'starttls' };
  assert.equal(validateConfig(valid).port, 1143);
  for (const patch of [{ host: 'evil.example' }, { host: '127.0.0.1.evil.example' },
    { security: 'none' }, { port: 0 }, { port: 65536 }, { port: '1143' }, { version: 2 }]) {
    assert.throws(() => validateConfig({ ...valid, ...patch }));
  }
});

test('message IDs preserve mailbox identity and reject malformed input', () => {
  const id = encodeMessageId('Folders/Travel', '12345', 42);
  assert.deepEqual(decodeMessageId(id), { folder: 'Folders/Travel', validity: '12345', uid: 42 });
  for (const bad of ['', '../credentials.xml', 'A'.repeat(5000),
    Buffer.from(JSON.stringify({ folder: 'INBOX', validity: '1', uid: -1 })).toString('base64url')]) {
    assert.throws(() => decodeMessageId(bad));
  }
});
