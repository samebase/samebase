export function DraftPullRequestFeedbackBanner({
  message,
}: {
  message: string;
}) {
  return (
    <div className="mb-3 corner-notch-1 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
      {message}
    </div>
  );
}
