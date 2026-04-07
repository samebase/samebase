import solid from "vite-plugin-solid";
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    printWidth: 80,
    proseWrap: "always",
  },
  plugins: [solid()],
  test: {
    passWithNoTests: true,
  },
});
