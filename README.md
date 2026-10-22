# Blunderproof

Turn your own chess mistakes into training.

Enter your Chess.com username. Blunderproof analyzes your recent games with Stockfish and tells you **what** you blunder and **why** (hanging pieces, missed captures, missed mates, back-rank problems). It then drills you on puzzles that match those weaknesses. About every 10 puzzles you hit a **checkpoint**: the exact position from one of your own games, right before you blundered. Find the right move to pass.

> Other tools give you puzzles. Blunderproof drills a pattern, then makes you beat the exact position you lost in.

Works with your Chess.com account. Not affiliated with Chess.com or Lichess.

## Status

**Phase 0: analysis prototype (command line).** This proves blunder detection, pattern tagging and checkpoint selection on real games before any UI gets built. See [`docs/HANDOFF.md`](docs/HANDOFF.md) for the full plan.

## Running Phase 0

Requirements: Node 20+ and a native Stockfish binary on your `PATH` (`brew install stockfish`).

```bash
npm install
npm run phase0 -- <chess.com username>
npm test
```

## Credits

- **[Stockfish](https://stockfishchess.org/)** chess engine (GPL-3.0). Because of this, the project is licensed under GPL-3.0 and the source stays public.
- **[Lichess](https://lichess.org/)** for the open puzzle database (CC0) and the win-percentage formula.
- **[chess.js](https://github.com/jhlywa/chess.js)** for move generation and PGN parsing.

## License

GPL-3.0. See [LICENSE](LICENSE).
