import { cn } from "@/lib/utils";

type ResizeGripLinesProps = {
  className?: string;
};

export function ResizeGripLines({ className }: ResizeGripLinesProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex flex-col items-center gap-1 text-current", className)}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <span key={index} className={"h-1 w-1 rounded-full bg-current"} />
      ))}
    </div>
  );
}
