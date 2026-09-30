import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      {template !== null ? (
        <Button variant="ghost" className="mb-6" onClick={() => selectTemplate(null)}>
          <ArrowLeft aria-hidden="true" /> Templates
        </Button>
      ) : null}
      <h1 className="mb-8 text-2xl font-semibold" ref={heading} tabIndex={-1}>
        {template === null ? "Templates" : templates[template].repository}
      </h1>
      {template === null ? (
        <ul className="space-y-10">
          {templateIds.map((id) => (
            <li
              key={id}
              className="flex flex-col gap-4 @2xl:flex-row @2xl:items-center @2xl:justify-between"
            >
              <div>
                <h2 className="text-lg font-medium">{templates[id].repository}</h2>
                <p className="mt-1 text-muted-foreground">{templates[id].description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {id !== "samebase" ? (
                  <Button onClick={() => selectTemplate(id)}>Preview setup</Button>
                ) : null}
                <a
                  href={`https://github.com/${templates[id].repository}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {id === "base" ? "Source" : "Private source"}
                </a>
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
