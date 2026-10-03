import { useLayoutEffect, useRef, type RefObject } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";

export type WebGpuFrameRenderer<FrameInput> = {
  destroy: () => void;
  render: (frameInput: FrameInput) => Promise<void>;
};

/**
Creates a WebGPU renderer for the returned canvas ref and renders each frame input with it.

Every frame is a pure function of its input: the frame effect holds a delayRender handle until the
GPU finishes the submitted work, so Remotion captures only completed frames. Layout effects run in
order during the commit, so the frame effect always finds the renderer promise of the same commit.
Memoize `createRenderer` and `frameInput` so they change only when the renderer or frame changes.
*/
export function useWebGpuFrame<FrameInput>(
  createRenderer: (canvas: HTMLCanvasElement) => Promise<WebGpuFrameRenderer<FrameInput>>,
  frameInput: FrameInput,
): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Promise<WebGpuFrameRenderer<FrameInput>> | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const renderer = createRenderer(canvas);
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = null;
      renderer.then(
        (createdRenderer) => createdRenderer.destroy(),
        () => {},
      );
    };
  }, [createRenderer]);

  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    const handle = delayRender("Rendering a WebGPU frame");
    renderer
      .then((createdRenderer) => createdRenderer.render(frameInput))
      .then(
        () => continueRender(handle),
        (error: unknown) => cancelRender(error),
      );
  }, [createRenderer, frameInput]);

  return canvasRef;
}
