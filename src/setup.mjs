import { createInterface } from 'node:readline/promises';
import { mkdir, readFile, writeFile, rename, chmod, rm } from 'node:fs/promises';
import { randomBytes, X509Certificate } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { configDirectory, loadConnection, MailboxError, validateConfig } from './config.mjs';
import { MailboxService } from './mailbox.mjs';
import { seal } from './vault.mjs';

export async function ask(label, secret = false) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new MailboxError('Run this command in an interactive terminal. Never paste credentials into chat.');
  if (!secret) {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try { return (await terminal.question(label)).trim(); } finally { terminal.close(); }
  }
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = process.stdin.isRaw;
    const finish = (error) => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(wasRaw || false); process.stdin.pause(); process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = data => {
      for (const char of data.toString('utf8')) {
        if (char === '\u0003' || char === '\u0004') { finish(new MailboxError('Canceled.')); return; }
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\u007f' || char === '\b') value = [...value].slice(0, -1).join('');
        else if (char >= ' ' && value.length < 1024) value += char;
      }
    };
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', onData);
  });
}

export async function saveVault(directory, contents, passphrase) {
  const vault = await seal(contents, passphrase);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await chmod(directory, 0o700);
  const temporary = path.join(directory, `vault.json.${randomBytes(8).toString('hex')}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(vault), { mode: 0o600, flag: 'wx' });
    await rename(temporary, path.join(directory, 'vault.json'));
  } finally { await rm(temporary, { force: true }); }
}

export function clientConfig() {
  const executable = JSON.stringify(process.execPath);
  const cli = JSON.stringify(fileURLToPath(new URL('./cli.mjs', import.meta.url)));
  return `Codex config.toml:\n\n[mcp_servers.protonmail]\ncommand = ${executable}\nargs = [${cli}, "serve"]\nenv_vars = ["PROTONMAIL_MCP_PASSPHRASE", "PROTONMAIL_MCP_CONFIG_DIR"]\n\nClaude Desktop / other stdio clients:\n\n${JSON.stringify({ mcpServers: { protonmail: { command: process.execPath, args: [fileURLToPath(new URL('./cli.mjs', import.meta.url)), 'serve'] } } }, null, 2)}\n\nUnlock before launching the host. Never put passwords into this configuration.\nFor clients that filter environment variables, explicitly pass PROTONMAIL_MCP_PASSPHRASE from the parent environment using that client's secret/environment settings.\n`;
}

export async function setup() {
  console.log('ProtonMail MCP setup\n\nOpen Proton Mail Bridge and sign in. Use its IMAP username and generated password.\nExport the public TLS certificate from Bridge settings; do not select its private key.\nMail you request through MCP can be sent to your AI provider. No mailbox writes are enabled.\n');
  const port = Number(await ask('IMAP port from Bridge [1143]: ') || '1143');
  const mode = await ask('Connection security: starttls or tls [starttls]: ') || 'starttls';
  const config = validateConfig({ version: 1, host: '127.0.0.1', port, security: mode });
  const certPath = (await ask('Path to exported Bridge public certificate: ')).replace(/^"(.*)"$/, '$1');
  let certificate;
  try {
    const data = await readFile(path.resolve(certPath));
    if (data.includes(Buffer.from('PRIVATE KEY'))) throw new Error();
    certificate = new X509Certificate(data);
  } catch { throw new MailboxError('Cannot read a public X.509 certificate from that path. Export the public certificate from Bridge.'); }
  console.log(`Certificate SHA-256: ${certificate.fingerprint256}`);
  if ((await ask('Trust this certificate exported from your local Bridge? [yes/no]: ')).toLowerCase() !== 'yes') throw new MailboxError('Setup canceled before saving anything.');
  const user = await ask('Bridge IMAP username: ');
  const pass = await ask('Bridge IMAP password (hidden): ', true);
  if (!user || !pass) throw new MailboxError('Bridge username and password are required.');
  const passphrase = await ask('Choose a vault passphrase, 12+ characters (hidden): ', true);
  if (passphrase !== await ask('Repeat vault passphrase (hidden): ', true)) throw new MailboxError('Passphrases do not match. Nothing was saved.');
  // Validate before network I/O so a weak passphrase is caught without login.
  const contents = { config, certificate: certificate.toString(), auth: { user, pass } };
  await seal(contents, passphrase);
  console.log('Checking TLS and Bridge login...');
  await new MailboxService(async () => contents).status();
  await saveVault(configDirectory(), contents, passphrase);
  console.log('Saved encrypted credentials. Connection verified.\n\nRun: node src/cli.mjs config\nThen configure your host and launch it using: node src/cli.mjs launch <host-program>\nUse node src/cli.mjs doctor to check the connection.');
}

export async function launch(args) {
  if (!args.length) throw new MailboxError('Specify a host executable: launch codex, or on Windows launch powershell.exe -NoExit');
  const passphrase = await ask('Vault passphrase (hidden): ', true);
  // Verify the vault before starting the host; avoid guessing with a real login.
  const previous = process.env.PROTONMAIL_MCP_PASSPHRASE;
  process.env.PROTONMAIL_MCP_PASSPHRASE = passphrase;
  try { await loadConnection(); }
  finally {
    if (previous === undefined) delete process.env.PROTONMAIL_MCP_PASSPHRASE;
    else process.env.PROTONMAIL_MCP_PASSPHRASE = previous;
  }
  console.log('Vault unlocked for this host session. Close the host when finished.');
  const child = spawn(args[0], args.slice(1), { shell: false, stdio: 'inherit',
    env: { ...process.env, PROTONMAIL_MCP_PASSPHRASE: passphrase } });
  await new Promise((resolve, reject) => {
    child.once('error', () => reject(new MailboxError('Could not start the host executable. On Windows, launch powershell.exe -NoExit and start your MCP client inside that session.')));
    child.once('exit', code => { process.exitCode = code ?? 1; resolve(); });
  });
}
