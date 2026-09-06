import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal } from '../src/vault.mjs';
import { configDirectory } from '../src/config.mjs';

test('vault encrypts credentials, authenticates contents and rejects wrong passphrases', async () => {
  const credentials = { user: 'test@proton.me', pass: 'bridge-test-secret' };
  const encrypted = await seal(credentials, 'a long test passphrase');
  assert.ok(!JSON.stringify(encrypted).includes(credentials.pass));
  assert.deepEqual(await unseal(encrypted, 'a long test passphrase'), credentials);
  await assert.rejects(unseal(encrypted, 'wrong passphrase'), /unlock/);
  await assert.rejects(unseal({ ...encrypted, tag: Buffer.alloc(16).toString('base64') }, 'a long test passphrase'), /unlock/);
  await assert.rejects(seal(credentials, 'short'), /12/);
});

test('configuration directories follow each desktop OS', () => {
  assert.match(configDirectory('win32', { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' }, 'C:\\Users\\test'), /ProtonMailMCP$/);
  assert.equal(configDirectory('darwin', {}, '/Users/test'), '/Users/test/Library/Application Support/ProtonMailMCP');
  assert.equal(configDirectory('linux', { XDG_CONFIG_HOME: '/custom/config' }, '/home/test'), '/custom/config/protonmail-mcp');
});
