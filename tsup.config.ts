import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    target: "es2020",
    platform: "browser",
    format: ["cjs", "esm"],
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    outDir: "dist",
    tsconfig: "./tsconfig.json",
  },
  {
    entry: ["src/server.ts"],
    target: "node18",
    platform: "node",
    format: ["cjs", "esm"],
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    outDir: "dist",
    tsconfig: "./tsconfig.json",
  },
]);
