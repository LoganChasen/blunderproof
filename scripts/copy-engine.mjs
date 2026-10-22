// Copies the Stockfish WASM builds into public/engine so the browser can load them as a Web Worker.
import { cpSync, mkdirSync } from "node:fs";

const files = ["stockfish-19-lite.js", "stockfish-19-lite.wasm", "stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"];
mkdirSync("public/engine", { recursive: true });
for (const f of files) cpSync(`node_modules/stockfish/bin/${f}`, `public/engine/${f}`);
console.log(`Copied ${files.length} Stockfish files to public/engine/`);
