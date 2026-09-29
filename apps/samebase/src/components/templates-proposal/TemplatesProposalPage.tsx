import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clsx } from "clsx";
import { parts, partIds, templates, templateIds, type PartId, type TemplateId } from "./catalog";

type ProposalView =
  | { kind: "templates"; template: TemplateId }
  | { kind: "components"; part: PartId }
  | { kind: "setup"; template: "base" | "mail" };

/** Session-only choices let reviewers try the proposal without creating provider resources. */
export function TemplatesProposalPage() {
  const [view, setView] = useState<ProposalView>({ kind: "templates", template: "mail" });
  const [showIntegrationSteps, setShowIntegrationSteps] = useState(false);
  const contentHeading = useRef<HTMLHeadingElement>(null);
  const setupTemplate =
    view.kind === "templates" && view.template !== "samebase" ? view.template : null;

  function changeView(next: ProposalView) {
    // The current control can disappear when the view changes. Focus the new content after render.
    flushSync(() => setView(next));
    contentHeading.current?.focus();
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-6 @3xl:px-10 @3xl:py-8">
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Design study</span>
        </div>
        <h1
          className="text-3xl font-semibold tracking-tight"
          ref={view.kind === "setup" ? contentHeading : null}
          tabIndex={-1}
        >
          {view.kind === "setup" ? "Set up your app" : "Templates"}
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          {view.kind === "setup"
            ? "Review what this template needs before you create an app."
            : "Create an app, or use its components in an existing app."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Interactive proposal. Setup and component availability below are illustrative.
        </p>
      </header>

      {view.kind === "setup" ? (
        <TemplateSetupPreview
          template={view.template}
          onBack={() => changeView({ kind: "templates", template: view.template })}
        />
      ) : (
        <>
          <nav className="mb-8 flex flex-wrap gap-2" aria-label="Catalog">
            <Button
              variant={view.kind === "templates" ? "default" : "ghost"}
              aria-current={view.kind === "templates" ? "page" : undefined}
              onClick={() => changeView({ kind: "templates", template: "mail" })}
            >
              Templates
            </Button>
            <Button
              variant={view.kind === "components" ? "default" : "ghost"}
              aria-current={view.kind === "components" ? "page" : undefined}
              onClick={() => {
                changeView({ kind: "components", part: "mail" });
                setShowIntegrationSteps(false);
              }}
            >
              Components & integrations
            </Button>
          </nav>
          <div className="grid items-start gap-10 @3xl:grid-cols-[15rem_minmax(0,1fr)] @3xl:gap-12">
            <div
              className={clsx(
                "grid gap-2 @3xl:grid-cols-1",
                view.kind === "templates" ? "grid-cols-3" : "grid-cols-2",
              )}
              aria-label={view.kind === "templates" ? "Templates" : "Components and integrations"}
            >
              {view.kind === "templates"
                ? templateIds.map((id) => {
                    const template = templates[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={view.template === id}
                        onClick={() => changeView({ kind: "templates", template: id })}
                        className="w-full cursor-pointer p-3 text-left outline-offset-4 hover:bg-muted focus-visible:outline-2 aria-pressed:bg-muted @3xl:p-4"
                      >
                        <span className="block text-sm font-medium @3xl:text-base">
                          {template.name}
                        </span>
                        <span className="mt-1 hidden text-sm text-muted-foreground @3xl:block">
                          {template.summary}
                        </span>
                        <span className="mt-3 hidden font-mono text-xs text-muted-foreground @3xl:block">
                          {template.repository}
                        </span>
                      </button>
                    );
                  })
                : partIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={view.part === id}
                      onClick={() => {
                        changeView({ kind: "components", part: id });
                        setShowIntegrationSteps(false);
                      }}
                      className="w-full cursor-pointer p-4 text-left outline-offset-4 hover:bg-muted focus-visible:outline-2 aria-pressed:bg-muted"
                    >
                      <span className="block font-medium">{parts[id].name}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {parts[id].kind}
                      </span>
                    </button>
                  ))}
            </div>

            {view.kind === "templates" ? (
              <section
                className="min-w-0 space-y-8"
                aria-label={`${templates[view.template].name} template`}
              >
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {templates[view.template].status}
                  </p>
                  <h2 className="text-2xl font-semibold" ref={contentHeading} tabIndex={-1}>
                    {templates[view.template].name}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                    {templates[view.template].description}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {setupTemplate === null ? (
                      <p className="text-sm text-muted-foreground">
                        Reference only until a reusable release is ready.
                      </p>
                    ) : (
                      <Button
                        onClick={() => {
                          changeView({ kind: "setup", template: setupTemplate });
                        }}
                      >
                        Preview setup <ArrowRight aria-hidden="true" />
                      </Button>
                    )}
                    <a
                      href={`https://github.com/${templates[view.template].repository}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm hover:underline"
                    >
                      {view.template === "base" ? "Source" : "Private source"}{" "}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Proposed contents</h3>
                  <ul>
                    {templates[view.template].parts.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center justify-between gap-4 py-3 text-left hover:text-secondary focus-visible:outline-2"
                          onClick={() => {
                            changeView({ kind: "components", part: id });
                            setShowIntegrationSteps(false);
                          }}
                        >
                          <span>
                            <span className="block text-sm">{parts[id].name}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {parts[id].kind}
                            </span>
                          </span>
                          <span className="flex items-center gap-3 text-right text-xs text-muted-foreground">
                            {id === "posthog"
                              ? "Proposed default"
                              : id === "mail"
                                ? "Extraction planned"
                                : null}
                            <ArrowRight className="size-3" aria-hidden="true" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Setup</h3>
                  <p className="text-sm text-muted-foreground">{templates[view.template].setup}</p>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    How updates work
                  </summary>
                  <p className="mt-3 leading-6 text-muted-foreground">
                    New apps use a tested template release. Requested updates arrive as pull
                    requests. Review and test each update before you apply it.
                  </p>
                </details>
              </section>
            ) : (
              <section
                className="min-w-0 space-y-8"
                aria-label={`${parts[view.part].name} details`}
              >
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">{parts[view.part].status}</p>
                  <h2 className="text-2xl font-semibold" ref={contentHeading} tabIndex={-1}>
                    {parts[view.part].name}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {parts[view.part].description}
                  </p>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">
                    {view.part === "posthog" ? "Planned for" : "Example apps"}
                  </h3>
                  <div className="space-y-2">
                    {templateIds
                      .filter((id) => templates[id].parts.some((part) => part === view.part))
                      .map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="flex w-full cursor-pointer items-center justify-between gap-3 py-2 text-left text-sm hover:underline focus-visible:outline-2"
                          onClick={() => changeView({ kind: "templates", template: id })}
                        >
                          <span className="font-mono">{templates[id].repository}</span>
                          <ArrowRight className="size-3" aria-hidden="true" />
                        </button>
                      ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Use in an existing app</h3>
                  <p className="mb-4 text-sm leading-6 text-muted-foreground">
                    {parts[view.part].requirement}
                  </p>
                  <Button
                    variant="ghost"
                    aria-expanded={showIntegrationSteps}
                    onClick={() => setShowIntegrationSteps(!showIntegrationSteps)}
                  >
                    {showIntegrationSteps ? "Hide integration steps" : "View integration steps"}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  {showIntegrationSteps ? (
                    <ol className="mt-4 list-decimal space-y-3 pl-5">
                      {parts[view.part].steps.map((step) => (
                        <li className="text-sm text-muted-foreground" key={step}>
                          {step}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function TemplateSetupPreview({
  template,
  onBack,
}: {
  template: "base" | "mail";
  onBack: () => void;
}) {
  const [repositoryName, setRepositoryName] = useState(
    template === "mail" ? "my-mail-app" : "my-app",
  );
  const [reviewed, setReviewed] = useState(false);
  return (
    <section className="max-w-xl space-y-8" aria-label="App setup proposal">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Templates
      </Button>
      <div>
        <h2 className="text-xl font-semibold">{templates[template].name}</h2>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {templates[template].repository}
        </p>
      </div>
      <form
        className="space-y-8"
        onSubmit={(event) => {
          event.preventDefault();
          setReviewed(true);
        }}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="template-repository-name">
            Repository name
          </label>
          <Input
            id="template-repository-name"
            required
            value={repositoryName}
            onChange={(event) => {
              setRepositoryName(event.target.value);
              setReviewed(false);
            }}
          />
        </div>
        <div>
          <h3 className="mb-4 text-sm font-medium">Required setup</h3>
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt>GitHub</dt>
              <dd className="text-muted-foreground">New private repository</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Convex</dt>
              <dd className="text-muted-foreground">New project</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Cloudflare</dt>
              <dd className="text-muted-foreground">New Worker</dd>
            </div>
            {template === "mail" ? (
              <>
                <div className="flex justify-between gap-4">
                  <dt>R2 storage</dt>
                  <dd className="text-muted-foreground">New private bucket</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Email routing</dt>
                  <dd className="text-muted-foreground">Your domain in Cloudflare</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Owner and recovery email</dt>
                  <dd className="text-muted-foreground">Verification required</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Connect later</h3>
          <p className="text-sm text-muted-foreground">
            PostHog. The proposed setup stays inactive until you connect your own project.
          </p>
        </div>
        <Button type="submit">
          Review setup <ArrowRight aria-hidden="true" />
        </Button>
        {reviewed ? (
          <div role="status" className="space-y-2 text-sm">
            <p className="font-medium">Setup preview for {repositoryName}</p>
            <p className="text-muted-foreground">
              The real flow will check provider access, pin the template version, then create the
              repository and resources. This design study creates no resources.
            </p>
          </div>
        ) : null}
      </form>
    </section>
  );
}
