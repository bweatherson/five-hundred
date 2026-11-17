import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const stub = (f: string) => fileURLToPath(new URL(`./src/stubs/${f}`, import.meta.url));

// The engine in ../src is shared with the test bench. Its only Node-specific code
// (loading saved tables from disk) is never used by the players the web app runs,
// so those imports are pointed at small browser stubs.
// `--mode artifact` builds a copy for a claude.ai page (see web/artifact.mjs).
export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "node:fs": stub("fs.ts"),
      "node:url": stub("url.ts"),
      "node:path": stub("path.ts"),
    },
  },
  server: { port: 5173 },
  build: { outDir: mode === "artifact" ? "dist-artifact" : "dist", emptyOutDir: true },
}));
