import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { saveVault, clientConfig } from '../src/setup.mjs';
import { unseal } from '../src/vault.mjs';

test('setup saves only encrypted data and produces secret-free host configuration', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'protonmail-setup-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const credentials = { auth: { user: 'test', pass: 'secret-bridge-password' } };
  await saveVault(directory, credentials, 'long setup test passphrase');
  const raw = await readFile(path.join(directory, 'vault.json'), 'utf8');
  assert.ok(!raw.includes(credentials.auth.pass));
  assert.deepEqual(await unseal(JSON.parse(raw), 'long setup test passphrase'), credentials);
  if (process.platform !== 'win32') assert.equal((await stat(path.join(directory, 'vault.json'))).mode & 0o777, 0o600);
  const config = clientConfig();
  assert.match(config, /mcp_servers\.protonmail/);
  assert.match(config, /PROTONMAIL_MCP_PASSPHRASE/);
  assert.ok(!config.includes(credentials.auth.pass));
});
