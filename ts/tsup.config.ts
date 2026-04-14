import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "ow/index": "src/ow/index.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  dts: false,
});
