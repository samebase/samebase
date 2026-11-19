import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import type { AlchemyStage } from "../../shared/alchemyStateModel";
import { stageWorkerBindings } from "./stageWorkerBindings";
import { resourceTypePresentation } from "./resourceTypePresentation";

export function AlchemyWorkerBindings({ stage }: { stage: AlchemyStage }) {
  const workers = useMemo(() => stageWorkerBindings(stage.resources), [stage.resources]);
  if (!workers.length) {
    return <p className="text-sm text-muted-foreground">No Cloudflare Workers in this stage.</p>;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] items-start gap-5">
      {workers.map((worker) => (
        <section key={worker.fqn} className="min-w-0">
          <h3 className="flex items-center gap-2 bg-muted/50 px-2 py-2 font-mono text-sm font-medium">
            <span className="shrink-0">{resourceTypePresentation("Cloudflare.Worker").icon}</span>
            <span className="min-w-0 break-all">{worker.fqn}</span>
          </h3>
          {worker.bindings.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No bindings recorded.</p>
          ) : (
            <dl className="ml-4 mt-1 grid gap-2 border-l border-border py-1">
              {worker.bindings.map((binding, index) => (
                <div
                  key={`${binding.name}:${index}`}
                  className="relative min-w-0 pl-4 before:absolute before:top-2 before:left-0 before:w-2 before:border-t before:border-border"
                >
                  <dt className="break-all font-mono text-xs font-medium">{binding.name}</dt>
                  <dd className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span>{binding.label}</span>
                    {binding.target ? (
                      <>
                        <ArrowRight aria-hidden="true" className="size-3 shrink-0" />
                        <span className="break-all font-mono text-foreground">
                          {binding.target}
                        </span>
                      </>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </div>
  );
}
