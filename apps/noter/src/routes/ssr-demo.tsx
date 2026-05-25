import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type SsrDemoRuntime = "server" | "client";

function readSsrDemoRuntime(): SsrDemoRuntime {
  return typeof window === "undefined" ? "server" : "client";
}

function SsrDemoRouteComponent() {
  const loaderData = Route.useLoaderData();
  const [hydrationState, setHydrationState] = useState("server-html");

  useEffect(() => {
    setHydrationState("hydrated");
  }, []);

  return (
    <main
      className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10 text-foreground"
      data-hydration-state={hydrationState}
      data-loader-runtime={loaderData.runtime}
      data-testid="ssr-demo-route"
    >
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">TanStack Start</p>
        <h1 className="text-3xl font-semibold">SSR demo</h1>
      </header>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-muted-foreground">Loader runtime</dt>
          <dd data-testid="ssr-demo-loader-runtime">{loaderData.runtime}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">Loader timestamp</dt>
          <dd data-testid="ssr-demo-loader-timestamp">{loaderData.loadedAt}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">Initial markup</dt>
          <dd data-testid="ssr-demo-initial-markup">present in the first HTML document</dd>
        </div>
        <div>
          <dt className="font-medium text-muted-foreground">Hydration state</dt>
          <dd data-testid="ssr-demo-hydration-state">{hydrationState}</dd>
        </div>
      </dl>
    </main>
  );
}

export const Route = createFileRoute("/ssr-demo")({
  staticData: { permission: "public" },
  ssr: true,
  loader: () => ({
    loadedAt: new Date().toISOString(),
    runtime: readSsrDemoRuntime(),
  }),
  component: SsrDemoRouteComponent,
});
