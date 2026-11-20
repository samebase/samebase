import { resourceTypeUI } from "@samebase/alchemy-kit/ui";
import { type ReactNode, useState } from "react";
import { AlchemyIsometricIcon } from "@/components/AlchemyIsometricIcon";
import {
  type DiagramBox,
  layoutDiagram,
  type StageDiagram,
} from "@/components/alchemyStageDiagramModel";

function DiagramBoxDetails({ box }: { box: DiagramBox }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 border p-3 text-xs">
      <dt className="text-muted-foreground">Type</dt>
      <dd>{box.typeName}</dd>
      <dt className="text-muted-foreground">Status</dt>
      <dd>{[...new Set(box.rows.map((row) => row.status))].join(", ")}</dd>
      {box.urls.length === 0 ? null : (
        <>
          <dt className="text-muted-foreground">URLs</dt>
          <dd className="grid min-w-0">
            {box.urls.map((url) => (
              <a
                key={url}
                className="break-all font-mono"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                {url}
              </a>
            ))}
          </dd>
        </>
      )}
      {box.folded.length === 0 ? null : (
        <>
          <dt className="text-muted-foreground">Resources</dt>
          <dd className="grid min-w-0">
            {box.folded.map((row) => (
              <span key={row.fqn}>
                <span className="break-all font-mono">{row.logicalId}</span>{" "}
                <span className="text-muted-foreground">
                  {resourceTypeUI(row.resourceType).name}
                </span>
              </span>
            ))}
          </dd>
        </>
      )}
    </dl>
  );
}

/**
The main resources of a stage as boxes, with lines from `downstream`. Each box links to its Worker
or Convex app, and a click on the box opens its details below the diagram. A wide diagram scrolls
inside its frame.

`asides` are controls at the top right of a box, by box id, such as a menu of more links.
*/
export function AlchemyStageDiagram({
  diagram,
  asides,
}: {
  diagram: StageDiagram;
  asides?: ReadonlyMap<string, ReactNode>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (diagram.boxes.length === 0) {
    return null;
  }

  const { nodes, frames, lines, width, height } = layoutDiagram(diagram);
  const open = diagram.boxes.find((box) => box.id === selected);

  return (
    <div className="mb-2">
      <div className="overflow-x-auto">
        <div className="relative" style={{ width, height }}>
          {frames.map((frame) => (
            <div
              key={frame.name}
              className="absolute border"
              style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
            >
              <span className="absolute top-1.5 left-2.5 font-mono text-xs text-muted-foreground">
                {frame.name}
              </span>
            </div>
          ))}
          <svg aria-hidden="true" className="absolute inset-0" width={width} height={height}>
            {lines.map((line) => (
              <g key={line.key}>
                <path d={line.d} fill="none" className="stroke-muted-foreground/60" />
                {line.arrow ? (
                  <polygon points={line.arrow} className="fill-muted-foreground" />
                ) : null}
              </g>
            ))}
          </svg>
          {lines.map((line) =>
            line.labels.length === 0 ? null : (
              <span
                key={line.key}
                className="absolute -translate-x-1/2 -translate-y-1/2 bg-background px-1 text-center font-mono text-[11px] leading-[14px] whitespace-pre text-muted-foreground"
                style={{ left: line.label.x, top: line.label.y }}
              >
                {line.labels.join("\n")}
              </span>
            ),
          )}
          {nodes.map(({ box, position }) => (
            <div
              key={box.id}
              className={`absolute flex flex-col border bg-background p-2.5 ${box.id === selected ? "border-foreground" : ""}`}
              style={{ left: position.x, top: position.y, width: position.w, height: position.h }}
            >
              <div className="flex h-[50px] items-center gap-2.5">
                <AlchemyIsometricIcon
                  resourceType={box.resourceType}
                  category={box.category}
                  icon={box.icon}
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    aria-expanded={box.id === selected}
                    className="cursor-pointer text-left font-mono text-[13px] leading-[17px] font-medium after:absolute after:inset-0"
                    onClick={() => setSelected((current) => (current === box.id ? null : box.id))}
                  >
                    <span className="max-lines-2">{box.name}</span>
                  </button>
                  <div className="truncate text-xs text-muted-foreground">{box.typeName}</div>
                </div>
                {asides?.has(box.id) ? (
                  <div className="relative -mr-1.5 flex shrink-0 items-center">
                    {asides.get(box.id)}
                  </div>
                ) : null}
              </div>
              {box.link ? (
                <a
                  className="relative mt-1.5 truncate font-mono text-xs leading-[18px]"
                  href={box.link}
                  title={box.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  {new URL(box.link).host}
                </a>
              ) : null}
              {box.folded.length === 0 ? null : (
                <span className="mt-1 text-xs leading-4 text-muted-foreground">
                  {box.folded.length} more
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {open ? <DiagramBoxDetails box={open} /> : null}
    </div>
  );
}
