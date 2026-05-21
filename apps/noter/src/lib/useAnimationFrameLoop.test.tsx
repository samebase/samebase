// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useAnimationFrameLoop } from "./useAnimationFrameLoop";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

function TestAnimationFrameLoop({
  isRunning,
  onFrame,
}: {
  isRunning: boolean;
  onFrame: (deltaSeconds: number) => void;
}) {
  useAnimationFrameLoop({
    isRunning,
    onFrame,
  });

  return null;
}

function installAnimationFrameMock() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextAnimationFrameId = 1;

  const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback): number => {
    const animationFrameId = nextAnimationFrameId;
    nextAnimationFrameId += 1;
    callbacks.set(animationFrameId, callback);
    return animationFrameId;
  });
  const cancelAnimationFrameMock = vi.fn((animationFrameId: number) => {
    callbacks.delete(animationFrameId);
  });

  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: requestAnimationFrameMock,
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: cancelAnimationFrameMock,
  });

  return {
    cancelAnimationFrameMock,
    requestAnimationFrameMock,
    runNextFrame: (timestampMs: number) => {
      const nextEntry = Array.from(callbacks.entries()).at(0);
      if (!nextEntry) {
        throw new Error("Expected a queued animation frame");
      }

      const [animationFrameId, callback] = nextEntry;
      callbacks.delete(animationFrameId);
      act(() => {
        callback(timestampMs);
      });
      return animationFrameId;
    },
  };
}

function expectFrameDelta(
  onFrame: ReturnType<typeof vi.fn<(deltaSeconds: number) => void>>,
  expectedDeltaSeconds: number,
) {
  const call = onFrame.mock.calls.at(-1);
  if (!call) {
    throw new Error("Expected frame callback to be called");
  }

  expect(call[0]).toBeCloseTo(expectedDeltaSeconds);
}

describe("useAnimationFrameLoop", () => {
  let root: Root | null = null;

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot !== null) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    document.body.replaceChildren();
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: originalRequestAnimationFrame,
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: originalCancelAnimationFrame,
    });
  });

  function renderLoop({
    isRunning,
    onFrame,
  }: {
    isRunning: boolean;
    onFrame: (deltaSeconds: number) => void;
  }) {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    act(() => {
      localRoot.render(<TestAnimationFrameLoop isRunning={isRunning} onFrame={onFrame} />);
    });

    return {
      rerender: (nextProps: { isRunning: boolean; onFrame: (deltaSeconds: number) => void }) => {
        act(() => {
          localRoot.render(
            <TestAnimationFrameLoop isRunning={nextProps.isRunning} onFrame={nextProps.onFrame} />,
          );
        });
      },
    };
  }

  it("reports elapsed seconds after the first animation frame", () => {
    const animationFrameMock = installAnimationFrameMock();
    const onFrame = vi.fn<(deltaSeconds: number) => void>();

    renderLoop({
      isRunning: true,
      onFrame,
    });

    expect(animationFrameMock.requestAnimationFrameMock).toHaveBeenCalledTimes(1);
    animationFrameMock.runNextFrame(1000);
    expect(onFrame).not.toHaveBeenCalled();

    animationFrameMock.runNextFrame(1250);

    expect(onFrame).toHaveBeenCalledTimes(1);
    expectFrameDelta(onFrame, 0.25);
  });

  it("cancels the queued frame and resets elapsed time when stopped", () => {
    const animationFrameMock = installAnimationFrameMock();
    const onFrame = vi.fn<(deltaSeconds: number) => void>();
    const renderedLoop = renderLoop({
      isRunning: true,
      onFrame,
    });

    animationFrameMock.runNextFrame(1000);
    const queuedFrameId = animationFrameMock.runNextFrame(1100);
    expect(onFrame).toHaveBeenCalledTimes(1);

    renderedLoop.rerender({
      isRunning: false,
      onFrame,
    });

    expect(animationFrameMock.cancelAnimationFrameMock).toHaveBeenLastCalledWith(queuedFrameId + 1);

    renderedLoop.rerender({
      isRunning: true,
      onFrame,
    });
    animationFrameMock.runNextFrame(2000);
    expect(onFrame).toHaveBeenCalledTimes(1);

    animationFrameMock.runNextFrame(2100);
    expect(onFrame).toHaveBeenCalledTimes(2);
    expectFrameDelta(onFrame, 0.1);
  });

  it("uses the latest callback without restarting the running loop", () => {
    const animationFrameMock = installAnimationFrameMock();
    const firstOnFrame = vi.fn<(deltaSeconds: number) => void>();
    const secondOnFrame = vi.fn<(deltaSeconds: number) => void>();
    const renderedLoop = renderLoop({
      isRunning: true,
      onFrame: firstOnFrame,
    });

    animationFrameMock.runNextFrame(1000);
    expect(animationFrameMock.requestAnimationFrameMock).toHaveBeenCalledTimes(2);

    renderedLoop.rerender({
      isRunning: true,
      onFrame: secondOnFrame,
    });

    expect(animationFrameMock.requestAnimationFrameMock).toHaveBeenCalledTimes(2);
    animationFrameMock.runNextFrame(1250);

    expect(firstOnFrame).not.toHaveBeenCalled();
    expect(secondOnFrame).toHaveBeenCalledTimes(1);
    expectFrameDelta(secondOnFrame, 0.25);
  });
});
