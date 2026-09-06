import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startImap } from './imap-fixture.mjs';
import { seal } from '../src/vault.mjs';

test('production subprocess speaks MCP and uses the encrypted vault for real IMAP operations', async t => {
  const fixture = await startImap(); t.after(() => fixture.close());
  const directory = await mkdtemp(path.join(os.tmpdir(), 'protonmail-mcp-e2e-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const passphrase = 'synthetic test passphrase only';
  await writeFile(path.join(directory, 'vault.json'), JSON.stringify(await seal(fixture.connection, passphrase)), { mode: 0o600 });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), 'serve'], stderr: 'pipe',
    env: { ...process.env, PROTONMAIL_MCP_CONFIG_DIR: directory, PROTONMAIL_MCP_PASSPHRASE: passphrase } });
  let stderr = ''; transport.stderr?.on('data', data => { stderr += data.toString(); });
  const client = new Client({ name: 'protonmail-integration-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['mailbox_folders', 'mailbox_read', 'mailbox_search', 'mailbox_status']);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
  const status = await client.callTool({ name: 'mailbox_status', arguments: {} });
  assert.equal(status.structuredContent.connected, true);
  const folders = await client.callTool({ name: 'mailbox_folders', arguments: {} });
  assert.equal(folders.structuredContent.folders[0].path, 'INBOX');
  const results = await client.callTool({ name: 'mailbox_search', arguments: { limit: 1 } });
  const id = results.structuredContent.messages[0].message_id;
  const read = await client.callTool({ name: 'mailbox_read', arguments: { message_id: id } });
  assert.match(read.structuredContent.text, /simulated mailbox/);
  const database = await readFile(path.join(directory, 'mail-cache.sqlite'));
  assert.equal(database.subarray(0, 15).toString(), 'SQLite format 3');
  const bodyFetches = fixture.commands.filter(c => /BODY\.PEEK/.test(c)).length;
  const cached = await client.callTool({ name: 'mailbox_read', arguments: { message_id: id } });
  assert.deepEqual(cached.structuredContent, read.structuredContent);
  assert.equal(fixture.commands.filter(c => /BODY\.PEEK/.test(c)).length, bodyFetches);
  const invalid = await client.callTool({ name: 'mailbox_search', arguments: { limit: 1000 } });
  assert.equal(invalid.isError, true);
  const unknown = await client.callTool({ name: 'mail_send', arguments: {} });
  assert.equal(unknown.isError, true);
  assert.ok(!stderr.includes('fixture-password'));
  assert.ok(!stderr.includes('simulated mailbox'));
});
