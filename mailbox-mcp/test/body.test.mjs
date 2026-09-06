import test from 'node:test';
import assert from 'node:assert/strict';
import { simpleParser } from 'mailparser';
import { extractBody } from '../src/mailbox.mjs';

const parse = raw => simpleParser(Buffer.from(raw.join('\r\n')), {
  skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true });

const alternative = plain => [
  'From: Billing <no-reply@example.test>', 'Subject: Purchase confirmation',
  'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary=B', '',
  '--B', 'Content-Type: text/plain; charset=utf-8', '', plain,
  '--B', 'Content-Type: text/html; charset=utf-8', '',
  '<html><body><h1>Receipt</h1><p>Total: <b>EUR 47.88</b></p>',
  '<img src="https://tracker.example.test/pixel.gif" alt="spacer">',
  '<a href="https://example.test/invoice">View invoice</a></body></html>', '--B--', ''];

test('an empty text/plain sibling falls back to the HTML part', async () => {
  // mailparser stops at the empty text/plain inside multipart/alternative, so
  // without the fallback these messages read as blank.
  for (const plain of ['', '   ', '\r\n \r\n']) {
    const body = extractBody(await parse(alternative(plain)));
    assert.equal(body.source, 'html');
    assert.match(body.text, /RECEIPT/i);  // html-to-text upcases <h1>
    assert.match(body.text, /EUR 47\.88/);
  }
});

test('a real text/plain part is preferred over the HTML', async () => {
  const body = extractBody(await parse(alternative('Receipt: EUR 47.88 paid.')));
  assert.equal(body.source, 'plain');
  assert.equal(body.text.trim(), 'Receipt: EUR 47.88 paid.');
});

test('converted HTML keeps link destinations and drops tracking images', async () => {
  const body = extractBody(await parse(alternative('')));
  // C-6 in SECURITY-REVIEW.md: dropping href hides a disguised phishing target.
  assert.match(body.text, /https:\/\/example\.test\/invoice/);
  assert.ok(!body.text.includes('tracker.example.test'), 'tracking pixel must not appear');
});

test('oversized or unparseable HTML degrades to empty rather than throwing', () => {
  const huge = extractBody({ text: '', html: 'x'.repeat(1024 * 1024 + 1) });
  assert.equal(huge.source, 'html_unavailable');
  assert.equal(huge.text, '');
  assert.deepEqual(extractBody({}), { text: '', source: 'empty' });
  assert.deepEqual(extractBody(null), { text: '', source: 'empty' });
  assert.equal(extractBody({ text: '', html: '<p></p>' }).source, 'html_unavailable');
});
