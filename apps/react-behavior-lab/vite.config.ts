import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    printWidth: 80,
    proseWrap: "always",
  },
  plugins: [react()],
  test: {
    passWithNoTests: true,
  },
});
