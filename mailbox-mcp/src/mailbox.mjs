import { X509Certificate, createHash } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { z } from 'zod';
import { MailboxError, validateConfig, encodeMessageId, decodeMessageId, loadConnection } from './config.mjs';

const field = z.string().max(512).refine(v => !/[\x00-\x1f\x7f]/.test(v));
export const searchSchema = z.object({ folder: field.min(1).default('INBOX'),
  text: field.optional(), from: field.optional(), subject: field.optional(), unread: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).default(20), cursor: z.string().max(4096).optional() }).strict();
export const readSchema = z.object({ message_id: z.string().min(1).max(4096) }).strict();
const MAX_RAW = 2 * 1024 * 1024;
const WINDOW = 5000;

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new MailboxError('Invalid tool arguments. Check the tool schema and try again.');
  return result.data;
}

export function clean(value, limit = 512) {
  return String(value ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').slice(0, limit);
}
function addresses(list) {
  return (list || []).slice(0, 30).map(a => ({ name: clean(a.name, 100), address: clean(a.address, 254) }));
}
function date(value) { return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null; }
function queryHash(input) {
  return createHash('sha256').update(JSON.stringify([input.folder, input.text, input.from, input.subject, input.unread])).digest('hex');
}

export function connectionOptions(connection) {
  const config = validateConfig(connection.config);
  let certificate;
  try { certificate = new X509Certificate(connection.certificate); }
  catch { throw new MailboxError('Invalid Bridge certificate. Export its public TLS certificate and run setup again.'); }
  return { host: config.host, port: config.port, secure: config.security === 'tls',
    ...(config.security === 'starttls' ? { doSTARTTLS: true } : {}),
    auth: connection.auth, logger: false, logRaw: false, disableAutoIdle: true,
    disableCompression: true, disableBinary: true, disableAutoEnable: true,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    tls: { ca: certificate.toString(), rejectUnauthorized: true, minVersion: 'TLSv1.2',
      checkServerIdentity: (_host, peer) => peer.fingerprint256 === certificate.fingerprint256 ? undefined :
        new Error('Bridge certificate mismatch') } };
}

export function publicError(error) {
  if (error instanceof MailboxError) return error.message;
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(String(error?.code)) || /certificate/i.test(String(error?.message))) {
    return 'TLS certificate verification failed. Export the current Bridge certificate and run setup again.';
  }
  if (error?.authenticationFailed) return 'Bridge rejected the credentials. Use the IMAP password shown in Bridge, then run setup again.';
  return 'Cannot complete the mailbox request. Make sure Bridge is running and signed in, then run doctor.';
}

export class MailboxService {
  #active = 0;
  constructor(provider = loadConnection) { this.provider = provider; }

  async withClient(operation, signal) {
    if (this.#active >= 2) throw new MailboxError('Mailbox is busy. Retry after the current requests finish.');
    this.#active++;
    let client, timer;
    const abort = () => client?.close();
    try {
      if (signal?.aborted) throw new MailboxError('Mailbox request canceled.');
      const connection = await this.provider();
      client = new ImapFlow(connectionOptions(connection));
      client.on('error', () => {}); // Never print SDK errors carrying protocol data.
      timer = setTimeout(() => client.close(), 25000);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) throw new MailboxError('Mailbox request canceled.');
      await client.connect();
      return await operation(client);
    } catch (error) { throw new MailboxError(publicError(error)); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); client?.close(); this.#active--; }
  }

  status(signal) {
    return this.withClient(async client => {
      await client.noop();
      return { connected: true, read_only: true, transport: 'local Bridge over TLS' };
    }, signal);
  }

  folders(signal) {
    return this.withClient(async client => {
      const list = (await client.list()).filter(f => !f.flags.has('\\Noselect'));
      return { untrusted: true, folders: list.slice(0, 200).map(f => ({ path: clean(f.path), name: clean(f.name) })), truncated: list.length > 200 };
    }, signal);
  }

  async search(value = {}, signal) {
    const input = parse(searchSchema, value);
    const hash = queryHash(input);
    let cursor;
    if (input.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString());
        if (cursor.hash !== hash || !Number.isInteger(cursor.before) || cursor.before < 1 || cursor.before > 4294967295 ||
            !/^\d{1,20}$/.test(cursor.validity)) throw new Error();
      } catch { throw new MailboxError('Invalid cursor or changed query. Search again without a cursor.'); }
    }
    return this.withClient(async client => {
      const lock = await client.getMailboxLock(input.folder, { readOnly: true });
      try {
        const validity = String(client.mailbox.uidValidity);
        if (cursor && cursor.validity !== validity) throw new MailboxError('Mailbox changed. Search again without a cursor.');
        const high = Math.min(client.mailbox.uidNext - 1, cursor ? cursor.before - 1 : 4294967295);
        if (!client.mailbox.exists || high < 1) return { untrusted: true, messages: [], next_cursor: null };
        const low = Math.max(1, high - WINDOW + 1);
        const query = { uid: `${low}:${high}` };
        for (const key of ['text', 'from', 'subject']) if (input[key]) query[key] = input[key];
        if (input.unread !== undefined) query.seen = !input.unread;
        const found = await client.search(query, { uid: true });
        const ids = [...new Set(found || [])].filter(id => Number.isInteger(id) && id >= low && id <= high).sort((a, b) => b - a);
        const chosen = ids.slice(0, input.limit);
        const rows = chosen.length ? await client.fetchAll(chosen, { uid: true, envelope: true, flags: true, size: true }, { uid: true }) : [];
        const messages = rows.sort((a, b) => b.uid - a.uid).map(row => ({
          message_id: encodeMessageId(input.folder, validity, row.uid), subject: clean(row.envelope?.subject),
          from: addresses(row.envelope?.from), date: date(row.envelope?.date),
          unread: !row.flags?.has('\\Seen'), size_bytes: row.size,
        }));
        const before = ids.length > input.limit ? chosen.at(-1) : low;
        return { untrusted: true, messages, next_cursor: before > 1 ?
          Buffer.from(JSON.stringify({ hash, validity, before })).toString('base64url') : null };
      } finally { lock.release(); }
    }, signal);
  }

  async read(value, signal) {
    const input = parse(readSchema, value);
    const reference = decodeMessageId(input.message_id);
    return this.withClient(async client => {
      const lock = await client.getMailboxLock(reference.folder, { readOnly: true });
      try {
        if (String(client.mailbox.uidValidity) !== reference.validity) throw new MailboxError('Mailbox changed. Search again to get a fresh message ID.');
        const metadata = await client.fetchOne(reference.uid, { uid: true, size: true }, { uid: true });
        if (!metadata) throw new MailboxError('Message no longer exists. Search again.');
        if (!Number.isFinite(metadata.size) || metadata.size > MAX_RAW) throw new MailboxError('Message exceeds the 2 MiB read limit. Open it in Proton Mail.');
        const row = await client.fetchOne(reference.uid, { source: { start: 0, maxLength: MAX_RAW + 1 } }, { uid: true });
        if (!row?.source) throw new MailboxError('Message no longer exists. Search again.');
        if (row.source.length > MAX_RAW) throw new MailboxError('Message exceeds the 2 MiB read limit. Open it in Proton Mail.');
        const mail = await simpleParser(row.source, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true, maxHtmlLengthToParse: MAX_RAW });
        return { untrusted: true, message_id: input.message_id, subject: clean(mail.subject),
          from: addresses(mail.from?.value), to: addresses(mail.to?.value), date: date(mail.date),
          text: clean(mail.text, 20000), truncated: (mail.text?.length || 0) > 20000,
          attachments: mail.attachments.slice(0, 50).map(a => ({ filename: clean(a.filename), content_type: clean(a.contentType), size_bytes: a.size })),
          attachments_truncated: mail.attachments.length > 50 };
      } finally { lock.release(); }
    }, signal);
  }
}
