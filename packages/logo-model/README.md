# @samebase/logo-model

The Samebase logo geometry, and an interactive Menger sponge for React. The sponge ray-marches on
the GPU with [TypeGPU](https://typegpu.com). Drag rotates it, and the pointer opens deeper levels of
the fractal under it.

## Install

```sh
npm install @samebase/logo-model
```

React 19 is a peer dependency. The package already contains the TypeGPU build transform, so your
bundler needs no TypeGPU plugin. It needs no CSS either.

## Usage

The `menger-sponge` entry loads TypeGPU, so import it dynamically. The other entries hold the
defaults and types and do not load TypeGPU.

```tsx
import {
  LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
  LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE,
} from "@samebase/logo-model/logo-presentation-tilt";
import { type LogoViewState } from "@samebase/logo-model/logo-view-drag";
import { MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS } from "@samebase/logo-model/menger-automatic-probe";
import { MENGER_HOVER_DEFAULT_REVEAL_RADIUS } from "@samebase/logo-model/menger-hover";
import {
  MENGER_TYPE_GPU_DEFAULT_ANTIALIASING,
  MENGER_TYPE_GPU_DEFAULT_DEPTH,
} from "@samebase/logo-model/menger-type-gpu-settings";
import { lazy, Suspense, useState } from "react";

const MengerSponge = lazy(() =>
  import("@samebase/logo-model/menger-sponge").then((module) => ({
    default: module.MengerSponge,
  })),
);

export function Sponge({ fallbackSrc }: { fallbackSrc: string }) {
  const [view, setView] = useState<LogoViewState>({ elevationDegrees: 30, rotationDegrees: 40 });
  return (
    <div style={{ height: 480, width: 480 }}>
      <Suspense fallback={null}>
        <MengerSponge
          antialiasing={MENGER_TYPE_GPU_DEFAULT_ANTIALIASING}
          automaticProbe={{ ...MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS, enabled: false }}
          backgroundColor="#ffffff"
          cameraFrustumPadding={1}
          depth={MENGER_TYPE_GPU_DEFAULT_DEPTH}
          elevationDegrees={view.elevationDegrees}
          faceColors={{ left: "#3b82f6", right: "#1d4ed8", top: "#93c5fd" }}
          fallbackSrc={fallbackSrc}
          onInteractionEnd={setView}
          onRenderUnavailable={() => {}}
          onViewChange={setView}
          pointerTiltEnabled
          pointerTiltRadiusScale={LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE}
          pointerTiltStrengthScale={LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE}
          performanceMeasurementEnabled={false}
          resolutionScale={1}
          revealRadius={MENGER_HOVER_DEFAULT_REVEAL_RADIUS}
          rotationDegrees={view.rotationDegrees}
          viewDragConfig={undefined}
        />
      </Suspense>
    </div>
  );
}
```

The scene fills its parent, so give the parent a size. Colors are hex strings.

## WebGPU

The scene needs WebGPU. Until WebGPU is ready, and in browsers without it, the scene shows the
`fallbackSrc` image and calls `onRenderUnavailable` if WebGPU cannot start.

## License

Apache-2.0
