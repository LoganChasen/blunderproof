import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cross-origin isolation (credentialless, so Chess.com avatars still load) lets the multi-threaded Stockfish WASM build use SharedArrayBuffer.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
