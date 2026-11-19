import { useState } from "react";
import { AlchemySystemDiagram } from "./AlchemySystemDiagram";

const stage = {
  resources: [
    {
      fqn: "Gateway",
      value: JSON.stringify({
        resourceType: "Cloudflare.Worker",
        attr: { workerName: "gateway" },
        bindings: [
          {
            data: {
              bindings: [
                { type: "service", name: "API", service: "api", entrypoint: "Catalog" },
                { type: "browser", name: "BROWSER" },
              ],
            },
          },
        ],
      }),
    },
    {
      fqn: "Api",
      value: JSON.stringify({
        resourceType: "Cloudflare.Worker",
        attr: { workerName: "api" },
        bindings: [
          {
            data: {
              bindings: [
                { type: "d1", name: "DB", databaseId: "catalog" },
                {
                  type: "durable_object_namespace",
                  name: "SESSIONS",
                  className: "Session",
                  storage: "sqlite",
                },
              ],
            },
          },
        ],
      }),
    },
    {
      fqn: "Catalog",
      value: JSON.stringify({
        resourceType: "Cloudflare.D1Database",
        attr: { databaseId: "catalog" },
        downstream: ["Api"],
      }),
    },
  ],
};

export function AlchemyDiagramVisualFixture() {
  const [layer, setLayer] = useState<"bindings" | "dependencies">("bindings");
  return (
    <div className="w-full max-w-[800px] p-3">
      <AlchemySystemDiagram stage={stage} layer={layer} onLayerChange={setLayer} />
    </div>
  );
}
