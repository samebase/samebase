import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";

const PUBLIC_LAYOUT_STATIC_PATHS = ["/", LOCAL_STORAGE_ROUTE, "/privacy", "/terms"] as const;

export function readPublicLayoutShellPathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/, "");
}

export function isPublicLayoutShellPathname(pathname: string): boolean {
  const normalizedPathname = readPublicLayoutShellPathname(pathname);
  if (normalizedPathname === "/logo" || normalizedPathname.startsWith("/logo/")) {
    return true;
  }

  return PUBLIC_LAYOUT_STATIC_PATHS.some(
    (publicLayoutPath) => publicLayoutPath === normalizedPathname,
  );
}
