import { Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { Button } from "@/components/ui/button";
import { PublicWaitlistForm } from "@/components/PublicWaitlistForm";
import { StaticMarkdownDocument } from "@/components/StaticMarkdownDocument";
import { api } from "../../convex/_generated/api";
import { GetFunctionReferenceReturnType } from "@/lib/convexUtils";
import { parsePublishedPathContext } from "@/lib/vaultRoutes";
import { useEffect, useState } from "react";

function readPublishedFileName(filePath: string): string {
  return filePath.split("/").at(-1) ?? filePath;
}

/**
 * Public file routes either render a published snapshot or fail closed with a
 * product-specific explanation instead of the generic app 404.
 */
export function PublishedFileRoutePage(props: { pathname: string }) {
  const publishedContext = parsePublishedPathContext(props.pathname);
  const hasPublishedRouteContext =
    Boolean(publishedContext.owner) &&
    Boolean(publishedContext.repoName) &&
    Boolean(publishedContext.ref) &&
    Boolean(publishedContext.filePath);
  const resolvePublishedFile = useAction(
    api.publishedFilesActions.resolvePublishedFile,
  );
  const [publishedFile, setPublishedFile] = useState<
    | GetFunctionReferenceReturnType<
        typeof api.publishedFilesActions.resolvePublishedFile
      >
    | undefined
  >(undefined);

  useEffect(() => {
    if (
      !hasPublishedRouteContext ||
      !publishedContext.owner ||
      !publishedContext.repoName ||
      !publishedContext.ref ||
      !publishedContext.filePath
    ) {
      setPublishedFile(null);
      return;
    }

    let cancelled = false;
    setPublishedFile(undefined);

    void resolvePublishedFile({
      owner: publishedContext.owner,
      repoName: publishedContext.repoName,
      ref: publishedContext.ref,
      filePath: publishedContext.filePath,
    })
      .then((result) => {
        if (!cancelled) {
          setPublishedFile(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPublishedFile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    hasPublishedRouteContext,
    publishedContext.filePath,
    publishedContext.owner,
    publishedContext.ref,
    publishedContext.repoName,
    resolvePublishedFile,
  ]);

  if (hasPublishedRouteContext && publishedFile === undefined) {
    return null;
  }

  if (publishedFile) {
    const fileName = readPublishedFileName(publishedFile.filePath);

    return (
      <div className="container my-auto">
        <div
          data-testid="published-file-content"
          className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-12"
        >
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              {publishedFile.owner}/{publishedFile.repoName}/{publishedFile.ref}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {fileName}
            </h1>
          </div>
          {publishedFile.format === "markdown" ? (
            <StaticMarkdownDocument value={publishedFile.content} />
          ) : (
            <pre className="overflow-x-auto whitespace-pre-wrap text-sm leading-6">
              {publishedFile.content}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container my-auto">
      <div
        data-testid="published-file-unavailable-content"
        className="mx-auto flex max-w-[384px] flex-col gap-4 py-16 text-center"
      >
        <h2 className="text-xl font-semibold tracking-tight">
          This file is not public
        </h2>
        <p className="text-sm text-muted-foreground">
          Either this file does not exist or it has not been published yet. Join
          the waitlist and you&apos;ll be able to publish and share files like
          this once your spot opens up.
        </p>
        <code className="max-w-full overflow-x-auto text-xs text-muted-foreground">
          {props.pathname}
        </code>
        <PublicWaitlistForm submittedMessage="You're on the waitlist. We'll let you know when published file links open up." />
        <Button asChild variant="outline">
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
