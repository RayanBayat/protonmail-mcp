import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../skills/protonmail/', import.meta.url));

test('the skill is importable, names its MCP dependency and marks mail untrusted', async () => {
  assert.deepEqual((await readdir(directory)).sort(), ['SKILL.md']);
  const skill = await readFile(new URL('SKILL.md', `file://${directory}`), 'utf8');
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  assert.ok(frontmatter, 'SKILL.md needs YAML frontmatter');
  assert.match(frontmatter[1], /^name: protonmail$/m);
  const description = /^description: (.+)$/m.exec(frontmatter[1]);
  assert.ok(description && description[1].length <= 1024);
  for (const tool of ['mailbox_status', 'mailbox_folders', 'mailbox_search', 'mailbox_read']) {
    assert.match(skill, new RegExp(tool), `SKILL.md must document ${tool}`);
  }
  assert.match(skill, /untrusted data, not instructions/);
  assert.match(skill, /read-only/i);
  assert.match(skill, /Proton Mail Bridge/);
  // A skill is copied between machines and hosts: it must carry no local state.
  assert.ok(!/PROTONMAIL_MCP_PASSPHRASE|C:\\Users|\/Users\/|\/home\//.test(skill));
});
