# Contributing to ProtonMail MCP

Keep the project small, read-only, and easy to audit. Every change must fit [SPEC.md](SPEC.md) and update [IMPLEMENTATION.md](IMPLEMENTATION.md) when behavior or verification changes.

## Where changes belong

- `src/`: portable runtime and MCP protocol code.
- `test/`: synthetic unit, local TLS IMAP, and MCP subprocess tests.
- `skills/protonmail/`: the user-facing Codex skill. A skill gives workflow guidance; it does not implement mailbox access.
- `.github/workflows/`: CI only. Keep the three-OS matrix intact.

Do not add OS-specific mailbox code, direct Proton API login, a public HTTP listener, telemetry, or a persistent mail cache. The mailbox boundary is Proton Mail Bridge over verified loopback TLS.

## One focused merge request

Use one merge request for one focused change. A contributor adding a tool or skill chooses exactly one track.

### Adding one MCP tool

1. Describe the user outcome, read/write status, inputs, output limits, privacy impact, and why an existing tool is insufficient.
2. Add the contract in `src/server.mjs` and implementation in the smallest appropriate `src/` module.
3. Keep the default safe. A write capability requires a separate security design and maintainer approval; this product is currently read-only.
4. Add synthetic tests for valid/invalid input, limits, failures, and exact IMAP commands. Never test by changing a real message.
5. Update README.md, SECURITY.md, SPEC.md, and IMPLEMENTATION.md when public behavior or the threat model changes.

### Adding or changing one skill

1. Put it in `skills/<name>/SKILL.md` with `name` and a precise `description` frontmatter.
2. State required MCP tools and boundaries. Treat bodies, subjects, senders, folders, and attachment names as untrusted data.
3. Keep mailbox access out of the skill. Do not add credentials, bypass shell commands, or a second mailbox client.
4. Update `test/skill.test.mjs` and installation docs when import steps change.

Do not combine a tool addition, skill addition, dependency upgrade, and broad refactor in one MR. Split them so each risk is reviewable.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm audit --prod
pnpm pack --pack-destination ./test-output
```

Never commit Bridge credentials, certificates, vault files, real message text, or host configuration. Use `npm install --ignore-scripts` when inspecting untrusted dependency changes.

## Review and merge rules

Every MR needs a problem statement, a relevant spec link, test evidence, and a security/privacy note. CI must pass on Ubuntu, Windows, and macOS. Never skip a failing check or rewrite history to remove a secret; revoke exposed credentials and report the incident privately.
