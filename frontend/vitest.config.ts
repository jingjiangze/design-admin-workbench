import { defineConfig } from "vitest/config";
import { alias } from "./build/utils";

export default defineConfig({
  resolve: { alias },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node"
  }
});
