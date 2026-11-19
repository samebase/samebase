import { includes } from "@samebase/dependent";
import type { AlchemyStack, AlchemyStateObservation } from "../../shared/alchemyStateModel";
import { AlchemyStageResources } from "./AlchemyStageResources";
import { AlchemySystemDiagram } from "./AlchemySystemDiagram";
import { Boxes, ListTree, Table2 } from "lucide-react";
import { AlchemyStateTree, StackStateStore } from "./RepositoryAlchemyStateTree";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type AlchemyRouteSearch } from "@/routeSearch/alchemy";
import type { SearchPatch } from "@/routing/searchFlags";

const views = ["diagram", "inventory", "tree"] as const;
const viewLabels = { diagram: "System diagram", tree: "Tree", inventory: "Inventory" };
const viewIcons = { diagram: Boxes, tree: ListTree, inventory: Table2 };

// The same stack name can exist in more than one state store after a move.
const stackKey = (stack: AlchemyStack) => `${stack.store}:${stack.name}`;

function stackLabel(stack: AlchemyStack) {
  const repository = stack.stages[0].run.repository;
  return stack.name.startsWith(`${repository}/`)
    ? stack.name.slice(repository.length + 1)
    : stack.name;
}

export function AlchemyStackViews({
  observation,
  search,
  onChange,
}: {
  observation: Extract<AlchemyStateObservation, { store: "found" }>;
  search: AlchemyRouteSearch;
  onChange: (patch: SearchPatch<AlchemyRouteSearch>) => void;
}) {
  const { stacks } = observation;
  const layer =
    search.view === "bindings" || search.view === "dependencies" ? search.view : undefined;
  const view = search.view === "tree" || search.view === "inventory" ? search.view : "diagram";
  const appStack = stacks.find(({ name, stages }) => {
    const repository = stages[0].run.repository;
    return name === repository + "/apps/" + repository.split("/").at(-1);
  });
  const stack =
    stacks.find((candidate) => stackKey(candidate) === search.stack) ?? appStack ?? stacks[0];
  const prod = stack.stages.find((s) => s.name === "prod");
  const stage = stack.stages.find((s) => s.name === search.stage) ?? prod ?? stack.stages[0];
  function selectStack(key: string) {
    const next = stacks.find((candidate) => stackKey(candidate) === key);
    if (next)
      onChange({
        stack: key,
        stage: next.stages.some((s) => s.name === stage.name) ? stage.name : null,
      });
  }
  return (
    <div className="grid min-w-0 content-start gap-3 p-3">
      <ToggleGroup
        type="single"
        aria-label="Alchemy view"
        size="sm"
        variant="outline"
        className="max-w-full flex-wrap"
        value={view}
        onValueChange={(value) => {
          if (includes(views, value)) onChange({ view: value === "diagram" ? null : value });
        }}
      >
        {views.map((mode) => {
          const Icon = viewIcons[mode];
          return (
            <ToggleGroupItem key={mode} value={mode}>
              <Icon size={14} />
              {viewLabels[mode]}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      {view === "tree" ? (
        <AlchemyStateTree observation={observation} />
      ) : (
        <>
          {stacks.length > 1 && view === "inventory" ? (
            <Table aria-label="Alchemy stacks">
              <TableHeader>
                <TableRow>
                  <TableHead>Stack</TableHead>
                  <TableHead>Stages</TableHead>
                  <TableHead>Prod resources</TableHead>
                  <TableHead>Store</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stacks.map((candidate) => {
                  const production = candidate.stages.find((s) => s.name === "prod");
                  return (
                    <TableRow
                      key={stackKey(candidate)}
                      data-state={stack === candidate ? "selected" : undefined}
                    >
                      <TableCell className="whitespace-normal">
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto max-w-full justify-start p-0 text-left whitespace-normal"
                          aria-pressed={candidate === stack}
                          onClick={() => selectStack(stackKey(candidate))}
                        >
                          <span className="max-lines-3 break-all font-mono">
                            {stackLabel(candidate)}
                          </span>
                        </Button>
                      </TableCell>
                      <TableCell>{candidate.stages.length}</TableCell>
                      <TableCell>{production?.resources.length ?? "None"}</TableCell>
                      <TableCell>
                        <StackStateStore store={candidate.store} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
          <section className="grid min-w-0 gap-3" aria-label="Selected stack">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {stacks.length > 1 && view === "diagram" ? (
                <Select value={stackKey(stack)} onValueChange={selectStack}>
                  <SelectTrigger aria-label="Stack" className="max-w-full">
                    <SelectValue>
                      {stackLabel(stack)} · {stack.store}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {stacks.map((candidate) => (
                      <SelectItem key={stackKey(candidate)} value={stackKey(candidate)}>
                        {stackLabel(candidate)} · {candidate.store}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <h2 className="max-lines-3 break-all font-mono text-sm font-semibold">
                  {stackLabel(stack)}
                </h2>
              )}
              {stacks.length === 1 ? <StackStateStore store={stack.store} /> : null}
              <Select
                value={stage.name}
                onValueChange={(name) => onChange({ stack: stackKey(stack), stage: name })}
              >
                <SelectTrigger aria-label="Stage" className="max-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stack.stages.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {view === "diagram" ? (
              <AlchemySystemDiagram
                key={JSON.stringify([stackKey(stack), stage.name])}
                stage={stage}
                layer={layer}
                onLayerChange={(view) => onChange({ view })}
              />
            ) : (
              <AlchemyStageResources stage={stage} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
