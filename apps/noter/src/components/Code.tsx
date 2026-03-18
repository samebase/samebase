import { ReactNode } from "react";

export const Code = ({ children }: { children: ReactNode }) => {
  return (
    <code className="relative corner-notch-1 bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
      {children}
    </code>
  );
};
