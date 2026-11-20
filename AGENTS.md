# Speller — Agent Instructions

The full spec is `docs/DEMO_SPEC.md`. Read it fully before writing code. Follow its milestones (§11) in order and verify each one before moving on.

Key rules:
- Stack: TypeScript + Phaser 3 + Vite, tests with Vitest. Custom mask-based collision (spec §10.4); do not use Arcade/Matter physics for player-vs-text.
- Visible white text is real terrain. Rendering and collision must come from the same seeded handwriting output.
- Follow the color semantics in spec §1.1 exactly.
- No external art, font, or audio assets.
- All tunable numbers live in `src/config.ts`.
- Author-written text (jokes, notes, egg lines, humorous terrain words) comes ONLY from `docs/AUTHOR_LINES.md`, mirrored by ID in `src/content/lines.ts`. Never write, edit, or drop author lines yourself. If a new line is needed, use `[TODO: Nxx]` and append a `待写` entry to AUTHOR_LINES.md (spec §0.1).
- Bullet time (spec §5.6) is P0.
- Before finishing any milestone, `npm test` and `npm run build` must pass.
