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

export function AlchemyStageResources({ stage }: { stage: AlchemyStage }) {
  if (stage.resources.length === 0)
    return <p className="text-sm text-muted-foreground">This stage has no resources.</p>;
  const rows = stage.resources.map(({ fqn, value }) => {
    const state: unknown = JSON.parse(value);
    return { fqn, ...resourceStatePresentation(state) };
  });
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
