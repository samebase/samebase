import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, Expand } from "lucide-react";
import { AppDialogContent } from "@/components/AppDialogContent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { templates, templateIds } from "./catalog";

type SetupTemplate = "base" | "mail";

export function TemplatesProposalPage() {
  const [template, setTemplate] = useState<SetupTemplate | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  function selectTemplate(next: SetupTemplate | null) {
    // Selection removes the current control. Move focus to the new view's heading.
    flushSync(() => setTemplate(next));
    heading.current?.focus();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {template !== null ? (
        <Button variant="ghost" className="mb-6" onClick={() => selectTemplate(null)}>
          <ArrowLeft aria-hidden="true" /> Templates
        </Button>
      ) : null}
      <h1 className="mb-8 text-2xl font-semibold" ref={heading} tabIndex={-1}>
        {template === null ? "Templates" : templates[template].repository}
      </h1>
      {template === null ? (
        <ul className="grid gap-x-8 gap-y-12 @3xl:grid-cols-2">
          {templateIds.map((id) => (
            <li key={id} className="min-w-0 border bg-card">
              <Dialog>
                <DialogTrigger
                  aria-label={`View ${templates[id].repository} preview`}
                  className="group relative block w-full overflow-hidden border-b bg-muted/30 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  <img
                    src={templates[id].preview.src}
                    alt={templates[id].preview.alt}
                    width={1280}
                    height={800}
                    className="aspect-[8/5] w-full object-cover object-top"
                  />
                  <span className="absolute right-3 bottom-3 grid size-9 place-items-center border bg-background text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground">
                    <Expand className="size-4" aria-hidden="true" />
                  </span>
                </DialogTrigger>
                <AppDialogContent
                  size="xl"
                  className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-0"
                >
                  <DialogTitle className="pt-6 pr-12 pl-6">{templates[id].repository}</DialogTitle>
                  <img
                    src={templates[id].preview.src}
                    alt={templates[id].preview.alt}
                    className="w-full"
                  />
                  <DialogDescription className="px-6 pb-6">
                    {templates[id].preview.caption}
                  </DialogDescription>
                </AppDialogContent>
              </Dialog>
              <div className="p-5">
                <h2 className="text-xl font-medium">{templates[id].repository}</h2>
                <p className="mt-1 text-muted-foreground">{templates[id].description}</p>
                <div className="mt-5 flex min-h-9 flex-wrap items-center gap-4">
                  {id !== "samebase" ? (
                    <Button onClick={() => selectTemplate(id)}>Preview setup</Button>
                  ) : null}
                  <a
                    href={`https://github.com/${templates[id].repository}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {id === "base" ? "Source" : "Private source"}
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <TemplateSetupPreview template={template} />
      )}
    </main>
  );
}

function TemplateSetupPreview({ template }: { template: SetupTemplate }) {
  const [repositoryName, setRepositoryName] = useState(
    template === "mail" ? "my-mail-app" : "my-app",
  );
  const [reviewed, setReviewed] = useState(false);

  return (
    <form
      className="max-w-md space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        setReviewed(true);
      }}
    >
      <div className="space-y-2">
        <label htmlFor="template-repository-name">Repository name</label>
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
        <h2 className="mb-2 font-medium">Resources</h2>
        <ul className="space-y-2 text-muted-foreground">
          {templates[template].resources.map((resource) => (
            <li key={resource}>{resource}</li>
          ))}
        </ul>
      </div>
      <Button type="submit">Review setup</Button>
      {reviewed ? <p role="status">Preview only. No resources were created.</p> : null}
    </form>
  );
}
