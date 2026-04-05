import { cn } from "@/lib/utils";

type ResizeGripLinesProps = {
  className?: string;
  variant?: "dots" | "lines";
};

export function ResizeGripLines({
  className,
  variant = "lines",
}: ResizeGripLinesProps) {
  const isDots = variant === "dots";

  return (
    <div
      aria-hidden="true"
      className={cn(
        isDots
          ? "flex flex-col items-center gap-1 text-current"
          : "flex items-center gap-1 text-current",
        className,
      )}
    >
      {Array.from({ length: isDots ? 3 : 4 }, (_, index) => (
        <span
          key={index}
          className={
            isDots
              ? "h-1 w-1 rounded-full bg-current"
              : "h-2.5 w-px rounded-full bg-current"
          }
        />
      ))}
    </div>
  );
}
