import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export class MailboxError extends Error {}

export function validateConfig(value) {
  if (!value || value.version !== 1 || value.host !== '127.0.0.1' ||
      !Number.isInteger(value.port) || value.port < 1 || value.port > 65535 ||
      !['starttls', 'tls'].includes(value.security)) {
    throw new MailboxError('Invalid Bridge configuration. Run setup again. Only localhost with TLS is supported.');
  }
  return { version: 1, host: value.host, port: value.port, security: value.security };
}

export function configDirectory(platform = process.platform, env = process.env, home = os.homedir()) {
  if (env.PROTONMAIL_MCP_CONFIG_DIR) return path.resolve(env.PROTONMAIL_MCP_CONFIG_DIR);
  if (platform === 'win32') return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), 'ProtonMailMCP');
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Application Support', 'ProtonMailMCP');
  return path.posix.join(env.XDG_CONFIG_HOME || path.posix.join(home, '.config'), 'protonmail-mcp');
}

export async function loadConnection() {
  const directory = configDirectory();
  try {
    const { unseal } = await import('./vault.mjs');
    const raw = await readFile(path.join(directory, 'vault.json'), 'utf8');
    if (raw.length > 65536) throw new MailboxError('Invalid vault. Run setup again.');
    const contents = await unseal(JSON.parse(raw), process.env.PROTONMAIL_MCP_PASSPHRASE);
    const config = validateConfig(contents.config);
    if (typeof contents.certificate !== 'string' || !contents.certificate.includes('BEGIN CERTIFICATE') ||
        typeof contents.auth?.user !== 'string' || !contents.auth.user ||
        typeof contents.auth?.pass !== 'string' || !contents.auth.pass) throw new Error();
    return { config, certificate: contents.certificate, auth: contents.auth };
  } catch (error) {
    if (error instanceof MailboxError) throw error;
    throw new MailboxError('Bridge is not configured or its vault is invalid. Run setup first.');
  }
}

export function encodeMessageId(folder, validity, uid) {
  return Buffer.from(JSON.stringify({ folder, validity: String(validity), uid })).toString('base64url');
}

export function decodeMessageId(id) {
  try {
    if (typeof id !== 'string' || id.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error();
    const value = JSON.parse(Buffer.from(id, 'base64url').toString('utf8'));
    if (typeof value.folder !== 'string' || !value.folder || value.folder.length > 512 ||
        /[\x00-\x1f\x7f]/.test(value.folder) || !/^\d{1,20}$/.test(value.validity) ||
        !Number.isInteger(value.uid) || value.uid < 1 || value.uid > 4294967295) throw new Error();
    return { folder: value.folder, validity: value.validity, uid: value.uid };
  } catch {
    throw new MailboxError('Invalid message ID. Search the mailbox again and use the returned message_id.');
  }
}
