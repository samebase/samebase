import { cn } from "@/lib/utils";

export function ResizeGripLines({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex items-center gap-1 text-current", className)}
    >
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} className="h-2.5 w-px rounded-full bg-current" />
      ))}
    </div>
  );
}
