import typegpu from "unplugin-typegpu/rolldown";
import { defineConfig } from "vite-plus";

// The plugin types come from the standalone rolldown package, and `vp pack` declares its own
// rolldown copy. The pack config also takes any object with a name, so the plugin goes in as that.
const typegpuPlugin: { name: string } | { name: string }[] = typegpu();

export default defineConfig({
  pack: {
    clean: true,
    // `@samebase/dependent` is private, so its code and types go into the dist.
    deps: {
      alwaysBundle: ["@samebase/dependent"],
      dts: { alwaysBundle: ["@samebase/dependent"] },
      onlyImport: ["react", "typegpu"],
    },
    attw: {
      profile: "esm-only",
    },
    dts: { eager: true },
    entry: {
      "auto-rotation": "src/autoRotation.ts",
      "face-treatment": "src/faceTreatment.ts",
      identity: "src/identity.ts",
      "left-face-style": "src/leftFaceStyle.ts",
      "logo-presentation-tilt": "src/logoPresentationTilt.ts",
      "logo-scene-camera-depth": "src/logoSceneCameraDepth.ts",
      "logo-view-drag": "src/logoViewDrag.ts",
      "logo-view-drag-constants": "src/logoViewDragConstants.ts",
      "logo-view-snap": "src/logoViewSnap.ts",
      "menger-automatic-probe": "src/mengerAutomaticProbe.ts",
      "menger-depth-transition": "src/mengerDepthTransition.ts",
      "menger-hover": "src/mengerHover.ts",
      "menger-sponge": "src/MengerSponge.tsx",
      "menger-type-gpu-settings": "src/mengerTypeGpuSettings.ts",
      rotation: "src/rotation.ts",
      shuffle: "src/shuffle.ts",
      "sierpinski-carpet-hover": "src/sierpinskiCarpetHover.ts",
      surface: "src/surface.ts",
      "use-logo-view-drag": "src/useLogoViewDrag.ts",
      voxel: "src/voxel.ts",
    },
    // The workspace reads the `src` files from `exports`. `pnpm pack` swaps in
    // `publishConfig.exports`, which points at the dist.
    exports: { devExports: true, inlinedDependencies: false, packageJson: false },
    failOnWarn: true,
    format: "esm",
    platform: "neutral",
    // The dist then needs only the typegpu runtime, not this plugin.
    plugins: [typegpuPlugin],
    publint: true,
    target: "es2020",
  },
});
