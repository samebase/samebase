/**
 * Local ambient typings for the Three.js example modules used by Noter's VOX
 * preview. Keep these declarations aligned with the `three` version in
 * `apps/noter/package.json` when example loader/control APIs change upstream.
 */
declare module "three/examples/jsm/loaders/VOXLoader.js" {
  import type { Group } from "three";

  export type VOXChunk = {
    palette: number[];
    size: {
      x: number;
      y: number;
      z: number;
    };
    data: Uint8Array;
  };

  export type VOXResult = {
    chunks: VOXChunk[];
    scene: Group | null;
  };

  export class VOXLoader {
    parse(buffer: ArrayBuffer): VOXResult | undefined;
  }
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  import type { Camera, Vector3 } from "three";

  export class OrbitControls {
    constructor(object: Camera, domElement?: HTMLElement | null);
    enableDamping: boolean;
    dampingFactor: number;
    minDistance: number;
    maxDistance: number;
    target: Vector3;
    update(): boolean;
    dispose(): void;
    addEventListener(type: string, listener: (event: unknown) => void): void;
    removeEventListener(type: string, listener: (event: unknown) => void): void;
  }
}
