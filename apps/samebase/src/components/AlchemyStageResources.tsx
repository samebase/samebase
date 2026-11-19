import { validate } from "convex-helpers/validators";
import { v } from "convex/values";
import { ArrowRight } from "lucide-react";
import type { AlchemyStage } from "../../shared/alchemyStateModel";
import { resourceStatePresentation } from "./resourceTypePresentation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const { array, object, string } = v;
const vDependencyState = object({ downstream: array(string()) });

export function AlchemyStageResources({
  stage,
  view,
}: {
  stage: AlchemyStage;
  view: "inventory" | "dependencies";
}) {
  if (stage.resources.length === 0)
    return <p className="text-sm text-muted-foreground">This stage has no resources.</p>;
  const rows = stage.resources.map(({ fqn, value }) => {
    const state: unknown = JSON.parse(value);
    return { fqn, state, ...resourceStatePresentation(state) };
  });
  if (view === "inventory") {
    return (
      <Table aria-label="Stage resources">
        <TableHeader>
          <TableRow>
            <TableHead>Resource</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.fqn}>
              <TableCell className="font-mono break-all whitespace-normal">{row.fqn}</TableCell>
              <TableCell className="whitespace-normal">
                <span className="flex items-center gap-2">
                  {row.icon}
                  {row.label}
                </span>
              </TableCell>
              <TableCell>{row.status ?? "unknown"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  // Alchemy records the consumers of each resource. Group their inputs at the consuming end.
  const inputs = new Map<string, typeof rows>();
  const connected = new Set<string>();
  for (const row of rows) {
    if (!validate(vDependencyState, row.state, { allowUnknownFields: true })) continue;
    for (const consumer of new Set(row.state.downstream)) {
      const sources = inputs.get(consumer);
      if (sources) sources.push(row);
      else inputs.set(consumer, [row]);
      connected.add(row.fqn);
      connected.add(consumer);
    }
  }
  const byName = new Map(rows.map((row) => [row.fqn, row]));
  const independent = rows.filter((row) => !connected.has(row.fqn));
  return (
    <div className="grid gap-4 text-sm">
      {inputs.size > 0 ? (
        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] gap-2 pb-2 text-xs text-muted-foreground">
            <span>Inputs</span>
            <span />
            <span>Used by</span>
          </div>
          <ul className="grid gap-2" aria-label="Resource dependencies">
            {[...inputs]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([consumer, sources]) => (
                <li
                  key={consumer}
                  className="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] items-center gap-2 bg-muted/40 p-2"
                >
                  <ul className="grid gap-1 border-l border-border pl-2">
                    {sources.map((row) => (
                      <li key={row.fqn} className="flex items-center gap-2">
                        {row.icon}
                        <span className="break-all font-mono">{row.fqn}</span>
                      </li>
                    ))}
                  </ul>
                  <ArrowRight aria-label="Used by" className="size-4 text-muted-foreground" />
                  <span className="flex items-center gap-2">
                    {byName.get(consumer)?.icon}
                    <span className="break-all font-mono">{consumer}</span>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      {independent.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs text-muted-foreground">
            Resources without recorded dependencies
          </h3>
          <ul className="flex flex-wrap gap-2">
            {independent.map((row) => (
              <li key={row.fqn} className="flex items-center gap-2 bg-muted/40 px-2 py-1">
                {row.icon}
                <span className="break-all font-mono">{row.fqn}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
