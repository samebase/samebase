import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";

interface DaytonaPreviewErrorStateProps {
  message: string;
  isLoading: boolean;
  onShowPreview: () => void;
  onResetToGitHub?: () => void;
  isResettingToGitHub?: boolean;
  resetToGitHubDisabled?: boolean;
}

function buildDaytonaPreviewErrorMarkdown(message: string): string {
  const normalizedLines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (normalizedLines.length === 0) {
    return "## daytona preview error";
  }

  return `## daytona preview error

${normalizedLines.map((line) => `- ${line}`).join("\n")}`;
}

export function DaytonaPreviewErrorState({
  message,
  isLoading,
  onShowPreview,
  onResetToGitHub,
  isResettingToGitHub = false,
  resetToGitHubDisabled = false,
}: DaytonaPreviewErrorStateProps) {
  const handleResetToGitHubClick = () => {
    if (
      onResetToGitHub === undefined ||
      isResettingToGitHub ||
      resetToGitHubDisabled
    ) {
      return;
    }
    onResetToGitHub();
  };

  return (
    <div className="mt-3 corner-notch-1 border bg-background/70 p-3">
      <ProsemarkReadOnly
        value={buildDaytonaPreviewErrorMarkdown(message)}
        className="text-sm leading-6"
        styleVariant="landingCopy"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onShowPreview}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Loading...
            </>
          ) : (
            "Show Preview"
          )}
        </Button>
        {onResetToGitHub ? (
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetToGitHubClick}
            disabled={resetToGitHubDisabled || isResettingToGitHub}
            className="text-orange-600 hover:text-orange-700"
          >
            {isResettingToGitHub ? "Resetting..." : "Reset to GitHub"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
