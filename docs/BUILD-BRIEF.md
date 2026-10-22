# Blunderproof v1 UI: Build Brief (for parallel agents)

Read this fully before writing code. Also skim `docs/HANDOFF.md` (the product spec) and `README.md`.

## Product in one paragraph
A user types any Chess.com username. The site pulls their recent games, analyzes them **in the browser** with Stockfish WASM, and shows a report: what they blunder and why. Then they **train**. Themed puzzles from the Lichess puzzle database are weighted toward their weaknesses, and **every 10–15 puzzles a checkpoint appears: the exact position from one of their own games right before they blundered** ("From your game vs {opponent}, {date}"). They pass if they play the engine's top move, or one within 2 win% of it. Pass marks the checkpoint conquered. Fail shows the best move and the game link, and requeues it. The site must work for **any** username, not just the owner's (`chasenrooks`).

## Look and feel
Modeled on the Chess.com web UI, with a **blue accent instead of green**: dark warm-grey background, a left sidebar nav, the board on the left/center, and a side panel on the right with the puzzle status, buttons and move info. Primary buttons are chunky with a darker bottom edge (`border-b-4 border-accent-shade`), bold white text, rounded-md. Use the tokens in `src/app/globals.css` through Tailwind (`bg-bg`, `bg-surface`, `bg-surface-2`, `text-muted`, `text-faint`, `bg-accent`, `text-success`, `text-danger`, `border-border`, etc.). **Never hardcode hex colors in components.** Correct = success green, wrong = danger red (semantic), and everything branded = accent blue. Font: the `font-sans` system stack. It must work at phone width: the board goes full-width and the panel stacks below it. No horizontal scroll. Don't credit Chess.com/Lichess in a logo or the name; credit Stockfish (GPL) and the Lichess puzzle DB (CC0) in the footer/about.

## Tech
Next.js 16 App Router + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`) + Tailwind v4. `@/*` maps to `src/*`. Imports have **no `.js` suffix**. chess.js 1.4 for rules. react-chessboard v5, but **always use `src/web/board/Board.tsx`** (the shared themed wrapper; read its props). Stockfish WASM files are served from `/engine/` (`stockfish-19-lite.js` is multi-threaded and needs crossOriginIsolated, which next.config sends; `stockfish-19-lite-single.js` is the fallback). Run `npm run predev` once to copy them.

The core chess library (already built and tested, don't rewrite it) lives in `src/*.ts`:
- `analyze.ts`: `analyzeGame(game, username, engine: UciEngine)` → `GameAnalysis`, and `analysisCacheKey(game, engineName)`.
- `uci.ts`: `UciEngine` interface (`name`, `newGame()`, `analyze(fen, {depth, multiPv, movetimeMs})`) and `parseInfoLine`.
- `filter.ts`: `filterGames`. `chesscom.ts`: `fetchRecentGames` / `fetchArchives` / `fetchMonth` (**Node only**, uses fs cache; server routes only).
- `report.ts`: `buildReport(username, games, skipped)` → `ReportData` (errors with pattern, explanation, context, otherKind; checkpoints), and `plainSummary(report)`.
- `checkpoints.ts`: `selectCheckpoints`, `passesCheckpoint(cp, uci)`. `patterns/index.ts`: `PATTERN_LABEL`, `PATTERN_PHRASE`. `patterns/otherKind.ts`: `OTHER_KIND_LABEL`. `context.ts`: phase/clock buckets. `config.ts`: all thresholds.

Shared web contracts: **`src/web/types.ts`** (AnalysisState, PlayerApiResponse, Puzzle, TrainingItem, checkpointId). `src/web/metrics.ts` has `logEvent` (log the handoff's day-one metrics). If you need a contract change, say so in your final report instead of editing `types.ts`.

## Routes
- `/`: landing page with a username input → `/u/{username}`.
- `/u/[username]`: layout (already written) wraps everything in `<AnalysisProvider>` + `<AppShell>`.
- `/u/[username]` (page): report dashboard.
- `/u/[username]/train`: training session (drills + checkpoints).
- `/u/[username]/checkpoints`: your positions: conquered / pending / failed, each with a mini board and game link.
- `/u/[username]/stats`: metrics (events, puzzles solved, checkpoint pass rate, blunders per game over time).
- `/api/player/[username]`: server route → `PlayerApiResponse`.

## File ownership (STRICT: only create or edit files you own)
| Agent | Owns |
|---|---|
| **analysis** | `src/web/analysis/**`, `src/app/api/**`, `src/web/engine/**` |
| **puzzles** | `scripts/build-puzzles.ts`, `public/puzzles/**`, `src/web/puzzles/**`, `tests/puzzles*.test.ts` |
| **ui** | `src/web/ui/**`, `src/app/page.tsx`, `src/app/u/[username]/page.tsx`, `src/app/u/[username]/stats/**`, `src/app/u/[username]/checkpoints/**`, `src/app/layout.tsx`, `public/*.svg` (logo/favicon) |
| **training** | `src/web/training/**`, `src/app/u/[username]/train/**`, `tests/training*.test.ts` |

Nobody edits `src/*.ts` (the core library), `src/web/types.ts`, `src/web/board/Board.tsx`, `globals.css`, `package.json`, `next.config.ts`, or tsconfig. Need a dependency? Ask in your report. No git commands. Other agents are editing at the same time, so ignore type errors in files you don't own.

## Quality bar
- `npx tsc` must be clean for your files. `npx vitest run <your tests>` must pass. Pure logic goes in plain `.ts` modules with unit tests; React components stay thin.
- Handle loading, empty and error states everywhere: unknown user, a user with no games, analysis in progress, no checkpoints yet, storage blocked.
- `localStorage`/IndexedDB access is always wrapped in try/catch.
- Final report back to the lead: what you built (files), how to use your module's API, anything you couldn't finish, and any contract or dependency requests. Keep it concise.
