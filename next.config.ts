import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cross-origin isolation lets the multi-threaded Stockfish WASM build use SharedArrayBuffer.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
