import type { TopologyNode } from "./stageTopology";

const top = "var(--tile-top)";
const left = "var(--tile-left)";
const right = "var(--tile-right)";
const ink = "var(--tile-ink)";

function Slab({ y = 0 }: { y?: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <path d="M9 28 35 14 62 28 36 43Z" fill={top} />
      <path d="M9 28 36 43v7L9 35Z" fill={left} />
      <path d="m36 43 26-15v7L36 50Z" fill={right} />
      <path d="m11 28 25 13.7 24-13.3" stroke="white" opacity=".48" strokeWidth="1.4" fill="none" />
    </g>
  );
}

function Solid({ kind }: { kind: TopologyNode["kind"] }) {
  switch (kind) {
    case "worker":
      return (
        <>
          <Slab y={6} />
          <Slab y={-1} />
          <path d="m39 18-15 10 9 1-3 7 16-11-9-1Z" fill={ink} />
          <path d="m15 32 3 1.7m2 1.2 3 1.7m2 1.1 3 1.7" stroke={top} strokeWidth="1.5" />
        </>
      );
    case "database":
      return (
        <>
          <path d="M13 17v27c0 6 10 11 23 11s23-5 23-11V17Z" fill={left} />
          <path d="M36 28c12 0 20-4 23-9v25c0 6-10 11-23 11Z" fill={right} />
          <ellipse cx="36" cy="17" rx="23" ry="10" fill={top} />
          <ellipse cx="36" cy="17" rx="15" ry="5.8" stroke={left} strokeWidth="1.4" fill="none" />
          <path
            d="M13 26c0 6 10 11 23 11s23-5 23-11M13 35c0 6 10 11 23 11s23-5 23-11"
            stroke={top}
            strokeWidth="1.5"
            fill="none"
          />
        </>
      );
    case "bucket":
      return (
        <>
          <path d="m11 19 6 27c1 5 9 9 19 9s18-4 19-9l6-27Z" fill={left} />
          <path d="M36 28c12 0 21-4 25-9l-6 27c-1 5-9 9-19 9Z" fill={right} />
          <ellipse cx="36" cy="19" rx="25" ry="10" fill={top} />
          <ellipse cx="36" cy="19" rx="19" ry="6" fill={right} />
          <path
            d="M17 16c0 16 8 22 18 22 9 0 16-5 19-15"
            stroke={ink}
            strokeWidth="2"
            fill="none"
          />
        </>
      );
    case "browser":
      return (
        <>
          <path d="m10 15 41-9 9 6v32l-41 11-9-6Z" fill={right} />
          <path d="m10 15 41-9 9 6-41 10Z" fill={top} />
          <path d="m19 22 41-10v32L19 55Z" fill={left} />
          <path d="m23 28 33-8v20l-33 8Z" fill={top} />
          <path d="m28 33 8-2m-8 6 20-5" stroke={right} strokeWidth="2.3" />
        </>
      );
    case "project":
      return (
        <>
          <path d="m9 18 18-6 6 6 24-7 5 4v29L16 56l-7-5Z" fill={right} />
          <path d="m9 18 18-6 6 6-18 5Z" fill={top} />
          <path d="m15 24 42-12v30L15 54Z" fill={left} />
          <path d="m16 32 48-13-5 28-44 11Z" fill={top} />
          <path d="m23 38 20-6" stroke={right} strokeWidth="2" />
        </>
      );
    case "deployment":
      return (
        <>
          <Slab y={8} />
          <Slab />
          <Slab y={-8} />
          <path d="m46 34 10-5m-10 13 10-5m-10 13 10-5" stroke={top} strokeWidth="2.1" />
        </>
      );
    case "identity":
      return (
        <>
          <path d="m13 14 19-9 26 9v13c0 14-8 23-20 31l-9-5c-9-6-16-16-16-27Z" fill={left} />
          <path d="m13 14 19-9 26 9-20 9Z" fill={top} />
          <path d="m21 18 17 5 20-9v13c0 13-7 23-20 31-11-6-17-17-17-29Z" fill={right} />
          <path d="m28 35 7 5 13-17" fill="none" stroke={top} strokeWidth="4" />
        </>
      );
    case "credential":
      return (
        <>
          <Slab y={2} />
          <path d="m25 27 6 3 12-7m-4 2 4 2m-8 0 4 2" stroke={ink} strokeWidth="3.5" fill="none" />
          <ellipse cx="24" cy="28" rx="5.5" ry="3.5" stroke={ink} strokeWidth="3" fill={top} />
        </>
      );
    case "durable-object":
    case "resource":
      return (
        <>
          <path d="M11 20 35 7l26 13-25 15Z" fill={top} />
          <path d="m11 20 25 15v23L11 44Z" fill={left} />
          <path d="m36 35 25-15v24L36 58Z" fill={right} />
          {kind === "durable-object" ? (
            <>
              <path d="m23 20 12-6 13 6-12 7Z" fill="none" stroke={right} strokeWidth="2" />
              <path d="m43 37 11-6m-11 11 11-6" stroke={top} strokeWidth="2" />
            </>
          ) : null}
        </>
      );
  }
}

export function AlchemyResourceGlyph({ kind }: { kind: TopologyNode["kind"] }) {
  return (
    <svg className="system-glyph" viewBox="0 0 72 64" aria-hidden="true">
      <Solid kind={kind} />
    </svg>
  );
}
