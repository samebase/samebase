import { Button } from "@/components/ui/button";

export function FileViewPublishedFileActions(props: {
  canRender: boolean;
  hasPublishedBranchLink: boolean;
  hasVersionedLink: boolean;
  isPublishing: boolean;
  isUnpublishing: boolean;
  onPublish: () => void;
  onCopyPublicLink: () => void;
  onCopyVersionLink?: () => void;
  onUnpublish: () => void;
}) {
  if (!props.canRender) {
    return null;
  }

  return (
    <>
      <Button
        size="sm"
        variant={props.hasPublishedBranchLink ? "secondary" : "outline"}
        onClick={props.onPublish}
        disabled={props.isPublishing}
        className="h-6 px-2 text-xs"
      >
        {props.isPublishing
          ? props.hasPublishedBranchLink
            ? "Updating..."
            : "Publishing..."
          : props.hasPublishedBranchLink
            ? "Republish"
            : "Publish"}
      </Button>
      {props.hasPublishedBranchLink ? (
        <Button
          size="sm"
          variant="outline"
          onClick={props.onCopyPublicLink}
          className="h-6 px-2 text-xs"
        >
          Copy public link
        </Button>
      ) : null}
      {props.hasVersionedLink && props.onCopyVersionLink ? (
        <Button
          size="sm"
          variant="outline"
          onClick={props.onCopyVersionLink}
          className="h-6 px-2 text-xs"
        >
          Copy version link
        </Button>
      ) : null}
      {props.hasPublishedBranchLink ? (
        <Button
          size="sm"
          variant="outline"
          onClick={props.onUnpublish}
          disabled={props.isUnpublishing}
          className="h-6 px-2 text-xs"
        >
          {props.isUnpublishing ? "Unpublishing..." : "Unpublish"}
        </Button>
      ) : null}
    </>
  );
}
