import net from 'node:net';
import tls from 'node:tls';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';

const execute = promisify(execFile);
const quote = value => JSON.stringify(value);
const messages = [1, 2].map(uid => ({ uid, subject: uid === 1 ? 'First message' : 'Second message',
  raw: Buffer.from(`From: Alice <alice@example.test>\r\nTo: Reader <reader@example.test>\r\nSubject: ${uid === 1 ? 'First message' : 'Second message'}\r\nDate: Sun, 06 Sep 2026 12:00:00 +0000\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello from the simulated mailbox ${uid}.\r\n`) }));

export async function startImap({ starttls = false, advertiseStarttls = starttls } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'protonmail-test-'));
  const keyPath = path.join(directory, 'key.pem'), certPath = path.join(directory, 'cert.pem');
  // Windows runners rarely have openssl on PATH; Git for Windows always ships one.
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
       'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe']
    : [];
  const openssl = candidates.find(existsSync) || 'openssl';
  try {
    await execute(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath,
      '-out', certPath, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { windowsHide: true });
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  const key = await readFile(keyPath), certificate = await readFile(certPath, 'utf8');
  const secureContext = tls.createSecureContext({ key, cert: certificate });
  const sockets = new Set(), commands = [];
  const state = { validity: 1, oversized: false, deleted: false };
  function attach(socket, greeting = true) {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    let buffer = '';
    const caps = `IMAP4rev1 AUTH=PLAIN${advertiseStarttls && !socket.encrypted ? ' STARTTLS' : ''}`;
    if (greeting) socket.write(`* OK fixture ready\r\n`);
    const onData = data => {
      buffer += data.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const match = /^(\S+) (.*)$/.exec(line); if (!match) continue;
        const [, tag, command] = match;
        commands.push(/^(AUTHENTICATE|LOGIN)/i.test(command) ? command.split(' ')[0] : command);
        const ok = () => socket.write(`${tag} OK completed\r\n`);
        if (/^CAPABILITY/i.test(command)) socket.write(`* CAPABILITY ${caps}\r\n${tag} OK done\r\n`);
        else if (/^STARTTLS/i.test(command)) {
          socket.write(`${tag} OK begin TLS\r\n`); socket.removeListener('data', onData);
          attach(new tls.TLSSocket(socket, { isServer: true, secureContext }), false); return;
        } else if (/^(AUTHENTICATE|LOGIN|NOOP|ID |ENABLE)/i.test(command)) ok();
        else if (/^(LIST|LSUB)/i.test(command)) {
          const kind = command.split(' ')[0];
          socket.write(`* ${kind} (\\HasNoChildren) "/" "INBOX"\r\n`); ok();
        } else if (/^EXAMINE/i.test(command)) {
          socket.write(`* FLAGS (\\Seen)\r\n* 2 EXISTS\r\n* OK [UIDVALIDITY ${state.validity}] valid\r\n* OK [UIDNEXT 3] next\r\n${tag} OK [READ-ONLY] opened\r\n`);
        } else if (/^UID SEARCH/i.test(command)) {
          const range = /UID (\d+):(\d+)/i.exec(command);
          const ids = messages.filter(m => !range || (m.uid >= +range[1] && m.uid <= +range[2])).map(m => m.uid);
          socket.write(`* SEARCH ${ids.join(' ')}\r\n`); ok();
        } else if (/^UID FETCH/i.test(command)) {
          const range = command.split(' ')[2];
          const selected = messages.filter(m => !state.deleted && range.split(',').some(part => {
            const [lo, hi = lo] = part.split(':').map(Number); return m.uid >= lo && m.uid <= hi;
          }));
          for (const m of selected) {
            const fields = [`UID ${m.uid}`];
            if (/RFC822.SIZE/i.test(command)) fields.push(`RFC822.SIZE ${state.oversized ? 3000000 : m.raw.length}`);
            if (/FLAGS/i.test(command)) fields.push('FLAGS ()');
            if (/ENVELOPE/i.test(command)) fields.push(`ENVELOPE ("Sun, 06 Sep 2026 12:00:00 +0000" ${quote(m.subject)} (("Alice" NIL "alice" "example.test")) NIL NIL (("Reader" NIL "reader" "example.test")) NIL NIL NIL "<${m.uid}@example.test>")`);
            if (/BODY.PEEK/i.test(command)) {
              socket.write(`* ${m.uid} FETCH (${fields.join(' ')} BODY[]<0> {${m.raw.length}}\r\n`);
              socket.write(m.raw); socket.write(')\r\n');
            } else socket.write(`* ${m.uid} FETCH (${fields.join(' ')})\r\n`);
          } ok();
        } else if (/^LOGOUT/i.test(command)) { socket.end(`* BYE\r\n${tag} OK logout\r\n`); }
        else socket.write(`${tag} BAD unsupported or mutating command\r\n`);
      }
    };
    socket.on('data', onData);
  }
  const server = starttls ? net.createServer(socket => attach(socket)) : tls.createServer({ key, cert: certificate }, socket => attach(socket));
  server.on('tlsClientError', () => {});
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { commands, state, connection: { config: { version: 1, host: '127.0.0.1', port: server.address().port, security: starttls ? 'starttls' : 'tls' },
    certificate, auth: { user: 'fixture-user', pass: 'fixture-password' } },
    async close() { for (const socket of sockets) socket.destroy(); server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); } };
}
