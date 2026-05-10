# omin

Omin is a local-first Codex work memory and skill system.

The first implementation is a small CLI that reads local Codex sessions, builds
a daily evolution report, generates skill candidates, and writes accepted
candidates to Markdown skills.

## Quick Start

```bash
npm install
npm run build
npm run omni -- sessions
npm run omni -- evolve --date 2026-05-11
npm run omni -- candidates --date 2026-05-11
npm run omni -- accept <candidate-id> --date 2026-05-11
npm run omni -- write-skills --date 2026-05-11
```

Generated local data is written under `.omni/` and is intentionally ignored by
git.

## Product Docs

- [Omni Next product direction](omni-next/docs/product.md)
- [Self-evolving agent research](omni-next/docs/research-self-evolving.md)
