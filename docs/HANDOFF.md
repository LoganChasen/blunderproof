# Blunderproof — Build Handoff

## What this is
A website that turns a player's own chess mistakes into training. You enter a Chess.com (or Lichess) username, the site analyzes your recent games with Stockfish, tells you **what** you blunder and **why**, drills you on puzzles matching those weaknesses, and every ~10 puzzles hits you with a **checkpoint**: the exact position from one of your own games right before you blundered. You pass if you play the engine's top move or one just as good.

Name: Blunderproof. Must not use "Chess.com" or "Lichess" in the name or logo. "Works with your Chess.com account" is fine.

## Goals
1. **Ship v1 fast** and get it in front of real players within ~2 weeks of starting the UI.
2. **Be clearly different from Aimchess.** The pitch: "Aimchess gives you puzzles. This drills a pattern, then makes you beat the exact position you lost in, and lets you replay the game from there."
3. **Track real metrics from day one** (users, sessions, checkpoints passed, blunder rate per game over time). This is a portfolio project for PM internship recruiting, so numbers matter as much as features.
4. **Open source on GitHub** (required anyway by Stockfish's GPL license).

## Owner
Logan (CS + Finance, Emory). Wants plain-English explanations and concrete examples, not jargon. Keep him informed of decisions in short summaries.

---

## Phase 0 — Prototype first (do this BEFORE any UI)
The two hardest problems are (a) explaining *why* a blunder happened and (b) picking real positions that make fair puzzles. Prove both on real games before building the site.

Build a Node/TypeScript script that:
1. Takes a Chess.com username (Logan will provide his) and pulls the last 1–2 months of games.
2. Filters out junk (see "Game filtering" below).
3. Runs Stockfish on every move and labels inaccuracies / mistakes / blunders.
4. Tags each blunder with a pattern (see "Pattern detection").
5. Applies the checkpoint-quality filter (see "Checkpoint selection").
6. Prints a blunder report + a list of candidate checkpoint positions (FEN, the move played, best move, clock left, link to the game).

**Exit criteria for Phase 0:** Logan looks at the output and agrees (1) the blunders are real, (2) the pattern tags are mostly right, and (3) the candidate checkpoints feel like fair puzzles. Also report what % of blunders land in "other," since that tells us where pattern detection needs work.

---

## Data sources

### Chess.com Published Data API (no key, no login)
- Archive list: `GET https://api.chess.com/pub/player/{username}/games/archives` → list of monthly URLs, going back to account creation.
- Month of games: `GET https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}`
- Profile: `GET https://api.chess.com/pub/player/{username}` (has a membership `status` field; membership does NOT affect game data — free and Premium users return identical game data).
- Each game includes the PGN with `[%clk ...]` clock comments after every move, ratings, result, time control, rules (variant), and sometimes `accuracies` (only if someone ran Game Review — don't rely on it).
- Chess.com's per-move labels (Brilliant/Great/Best/Miss/Blunder) are **not** in the API. We compute our own.
- **Rate limits:** make requests serially, not in parallel. Parallel requests can get 429s. Send a descriptive `User-Agent` with a contact email. Cache every month; a completed past month never changes, so only the current month needs re-fetching.
- Handle 404 / 410 (closed, banned, or nonexistent accounts) with a friendly "couldn't find games for this user" message.

### Lichess API (v1 stretch, otherwise v2)
- `GET https://lichess.org/api/games/user/{username}?max=100&clocks=true&evals=true&opening=true` with `Accept: application/x-ndjson`.
- Some games already include server evals; still run our own analysis for consistency.
- Respect rate limits (one request at a time; back off on 429).

### Lichess puzzle database (for themed drills)
- Free CSV from database.lichess.org (several million puzzles, CC0).
- Columns: `PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags`.
- **Gotcha:** the FEN is the position *before* the opponent's move. The first move in `Moves` is the opponent's move; the player solves from the position after it.
- Too large for the browser. Import into Postgres (Supabase), index on theme + rating, and query: "5 puzzles with theme `fork`, rating within ±150 of the user's estimated puzzle level, popularity > some floor."

---

## Engine analysis

- **Engine:** stockfish.js (WASM build), run in a **Web Worker** in the browser so the UI never freezes and there are no server costs. For the Phase 0 script, use the same build in Node or a native Stockfish binary.
- **Two-pass analysis:**
  1. Fast pass on every move (low depth / short movetime) to find candidate errors.
  2. Deep pass only on the candidates to confirm, so we don't accuse someone of a blunder that a shallow search misjudged.
- **Scoring:** convert centipawns to win % with the Lichess formula:
  `win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)` (mate scores → 0 or 100).
- **Classification** by how much the move dropped the mover's win %. Put thresholds in one config file. Start with Lichess-style defaults (inaccuracy ≥ 5, mistake ≥ 10, blunder ≥ 15 points on the 0–100 scale), then tune on Logan's games.
- Store per move: FEN before move, move played, best move, top-3 moves with evals (MultiPV 3), win % before/after, label, clock remaining, move number, game phase.
- **Cache analysis permanently** (keyed by game ID + engine version + depth). Never re-analyze a game.
- **Speed budget:** ~3–4 s per game in a test. Default to the last 20 games for a new user, show results as each game finishes, keep analyzing the rest in the background.

## Game filtering
Skip: non-standard variants (Chess960, etc.), daily/correspondence games (no clock data), aborted games, games under ~10 moves, games ending by early resignation or disconnect. v1 supports bullet, blitz, and rapid.

## Pattern detection ("why did I blunder?")
Hand-written detectors, no LLM explanations (they're unreliable on chess positions). v1 patterns:
- **Hanging piece:** the move left a piece undefended (or under-defended) and the engine's refutation takes it.
- **Missed capture:** a free or winning capture was available and the player didn't take it.
- **Missed mate:** the engine found a forced mate the player didn't play.
- **Back rank:** the refutation is a back-rank mate or mate threat.
- **Other:** everything else.

Also tag context on every blunder: game phase (opening / middlegame / endgame), clock remaining (e.g. under 30 s, under 10 s), and move number. v2 adds forks, pins, skewers, discovered attacks, and maps our tags to Lichess puzzle themes so drills match.

## Checkpoint selection (which real positions become puzzles)
A blunder position becomes a checkpoint only if:
- The best move is clearly better than the 2nd-best (e.g. ≥ 10 win % points gap), **or** it wins material / forces mate.
- It isn't a quiet positional move nobody would reasonably find.
- The position is from a live game (not daily).

## Pass rule for checkpoints
The user passes if their move is the top engine move **or** within a small margin of it (default: drops win % by no more than ~2 points vs. the top move). Requires MultiPV ≥ 3 at a decent depth on that position, computed once and stored. Margin lives in config; tune it so mediocre moves don't pass.

---

## User experience (v1)

1. **Landing:** enter Chess.com username → "Analyze my games."
2. **Blunder report:** plain-English summary, e.g. "34% of your blunders are hanging pieces, 22% are missed captures. Most happen in the middlegame with under 1 minute on the clock." Simple bar chart by pattern + phase + clock bucket.
3. **Training session:**
   - Themed drills pulled from the Lichess puzzle DB, weighted toward the user's top weaknesses.
   - Every ~10 puzzles: a checkpoint from their own game, ideally matching the pattern just drilled. Show it as "From your game vs. {opponent}, {date}."
   - Pass → mark conquered. Fail → show the best move, the game link, and requeue it.
4. **New/strong players** without enough blunders: fall back to themed drills only, with a note.

## Later versions
- **v2:** Failed checkpoints return on a spaced schedule (1, 3, 7 days) until passed. "Conquered positions" page. Trend charts (blunder rate per category over time). Lichess account support. More patterns.
- **v3:** "Retry the game" — after passing a checkpoint, keep playing that game from there against an engine near the opponent's rating. Note: Stockfish's strength limiter plays unnaturally and floors around ~1300; consider Maia (human-like engine trained at specific ratings).

Do not start v2 or v3 until v1 is shipped and has real users.

---

## Stack
- **Frontend/app:** Next.js (App Router) + TypeScript, deployed on Vercel
- **Board:** chessboard.js or react-chessboard; move legality via chess.js
- **Engine:** stockfish.js (WASM) in a Web Worker
- **Database/auth:** Supabase (Postgres). Auth optional for v1; a username + local session is enough to start.
- **Styling:** Tailwind

### Suggested tables
- `players` (username, platform, last_synced_at)
- `games` (id, player, platform, url, pgn, time_control, played_at, result, analyzed bool)
- `move_analysis` (game_id, ply, fen_before, move, best_move, top_moves jsonb, win_before, win_after, label, clock_ms, phase)
- `blunders` (move_analysis_id, pattern, is_checkpoint_candidate)
- `checkpoint_attempts` (player, blunder_id, passed, move_played, attempted_at, next_due_at)
- `puzzles` (Lichess DB import)
- `events` (player, type, payload, created_at) — for metrics

## Metrics to log from day one
Users who connected an account, sessions started, puzzles solved, checkpoints attempted / passed, return visits within 7 days, and blunder rate per game over time (steadier than rating changes for showing improvement).

## Legal and housekeeping
- Stockfish is GPL: credit it on the site and keep the repo public.
- Credit Lichess for the puzzle database.
- No Chess.com / Lichess branding in the name or logo.

## Known risks (in order of how much time they'll eat)
1. Pattern detection accuracy ("why")
2. Checkpoint quality filtering
3. Analysis speed on phones
4. Pass-rule margin tuning
5. Scope creep — ship v1 first

## Milestones
1. Phase 0 script + report on Logan's games → review with Logan
2. Puzzle DB imported and queryable by theme/rating
3. Username → analysis → blunder report page
4. Training session with drills + checkpoints + pass rule
5. Deploy, share with 10–20 real players, collect feedback
