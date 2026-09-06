#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.mjs';
import { MailboxService, publicError } from './mailbox.mjs';

const [command = 'help', ...args] = process.argv.slice(2);
try {
  if (command === 'serve') {
    const server = createServer();
    await server.connect(new StdioServerTransport());
    process.stdin.once('end', () => { void server.close(); });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void server.close().finally(() => process.exit(0)); });
  } else if (command === 'doctor') {
    if (!process.env.PROTONMAIL_MCP_PASSPHRASE && process.stdin.isTTY) {
      const { ask } = await import('./setup.mjs');
      process.env.PROTONMAIL_MCP_PASSPHRASE = await ask('Vault passphrase: ', true);
    }
    const service = new MailboxService();
    await service.status();
    const folders = await service.folders();
    console.log(`Connected to Proton Bridge over verified TLS. Read-only access works (${folders.folders.length} folders).`);
  } else if (command === 'setup') {
    await (await import('./setup.mjs')).setup();
  } else if (command === 'config') {
    console.log((await import('./setup.mjs')).clientConfig());
  } else if (command === 'launch') {
    await (await import('./setup.mjs')).launch(args);
  } else if (['help', '--help', '-h'].includes(command)) {
    console.log(`ProtonMail MCP - Windows, macOS and Linux\n\nCommands:\n  setup    Configure local Proton Bridge and encrypted credentials\n  doctor   Verify TLS, login and read-only folder access\n  config   Print MCP client settings without secrets\n  serve    Run the MCP server over stdio\n  launch <program> [args...]\n           Unlock the vault and start your MCP host for this session\n\nRequires Node.js 22+ and Proton Mail Bridge (paid Proton plan).\nMail returned to an AI host may be processed by its cloud provider.`);
  } else { console.error('Unknown command. Run with --help.'); process.exitCode = 1; }
} catch (error) { console.error(publicError(error)); process.exitCode = 1; }
