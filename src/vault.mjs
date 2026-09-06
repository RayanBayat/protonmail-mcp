import { randomBytes, scrypt, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { MailboxError } from './config.mjs';

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const aad = Buffer.from('protonmail-mcp-vault-v1');

export async function seal(contents, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) {
    throw new MailboxError('Choose a vault passphrase between 12 and 1024 characters.');
  }
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = await derive(passphrase, salt, 32, options);
  const plain = Buffer.from(JSON.stringify(contents));
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return { version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  } finally { key.fill(0); plain.fill(0); }
}

export async function unseal(value, passphrase) {
  if (typeof passphrase !== 'string' || !passphrase || passphrase.length > 1024) {
    throw new MailboxError('Vault is locked. Use the session launcher or set PROTONMAIL_MCP_PASSPHRASE before starting your MCP host.');
  }
  let key, plain;
  try {
    if (value.version !== 1) throw new Error();
    const fields = ['salt', 'iv', 'tag', 'ciphertext'].map(name => {
      if (typeof value[name] !== 'string' || value[name].length > 65536) throw new Error();
      return Buffer.from(value[name], 'base64');
    });
    const [salt, iv, tag, ciphertext] = fields;
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error();
    key = await derive(passphrase, salt, 32, options);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch { throw new MailboxError('Cannot unlock vault: wrong passphrase or damaged vault.'); }
  finally { key?.fill(0); plain?.fill(0); }
}
