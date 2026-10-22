# Blunderproof

Turn your own chess mistakes into training.

Enter your Chess.com username. Blunderproof analyzes your recent games with Stockfish and tells you **what** you blunder and **why** (hanging pieces, missed captures, missed mates, back-rank problems). It then drills you on puzzles that match those weaknesses. About every 10 puzzles you hit a **checkpoint**: the exact position from one of your own games, right before you blundered. Find the right move to pass.

> Other tools give you puzzles. Blunderproof drills a pattern, then makes you beat the exact position you lost in.

Works with your Chess.com account. Not affiliated with Chess.com or Lichess.

## Status

**v1 web app built.** Enter any Chess.com username and Blunderproof:

1. **Analyzes your games in your browser.** Stockfish 19 (WASM) runs in a Web Worker, so there's no server cost. It does your 20 most recent games first, the report updates live as each game finishes, and results are cached in IndexedDB.
2. **Shows a blunder report:** what you blunder (hanging pieces, missed captures, missed mates, back-rank problems), when (game phase, clock), and every blunder on a mini board with an explanation.
3. **Trains you.** Lichess puzzles are weighted toward your weaknesses, and **every 10–15 puzzles a checkpoint appears: the exact position from one of your own games right before you blundered.** Play the engine's move (or one within 2 win%) to conquer it. Miss it and you see the best move and the game link, and the position comes back later.
4. **Tracks metrics:** puzzles solved, checkpoint pass rate, puzzle rating, and blunders per game over time.

See [`docs/HANDOFF.md`](docs/HANDOFF.md) for the product spec and [`docs/BUILD-BRIEF.md`](docs/BUILD-BRIEF.md) for the architecture.

## Running it

Requirements: Node 20+.

```bash
npm install
npm run dev          # http://localhost:3000, then type any Chess.com username
npm test             # 133 unit tests
npm run build && npm start   # production build
```

### Phase 0 command-line report (optional)

This needs a native Stockfish on your `PATH` (`brew install stockfish`).

```bash
npm run phase0 -- <chess.com username> [--games 100]   # writes out/<user>/report.md
```

### Rebuilding the puzzle packs (optional)

The curated packs in `public/puzzles/` are committed. To rebuild them, download `lichess_db_puzzle.csv.zst` from database.lichess.org into `.cache/puzzles/` and run `npx tsx scripts/build-puzzles.ts`.

## Credits

- **[Stockfish](https://stockfishchess.org/)** chess engine (GPL-3.0). Because of this, the project is licensed under GPL-3.0 and the source stays public.
- **[Lichess](https://lichess.org/)** for the open puzzle database (CC0) and the win-percentage formula.
- **[chess.js](https://github.com/jhlywa/chess.js)** for move generation and PGN parsing.

## License

GPL-3.0. See [LICENSE](LICENSE).
