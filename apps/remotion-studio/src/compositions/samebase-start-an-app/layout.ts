import type { CSSProperties } from "react";

export const abs = (x: number, y: number, w?: number, h?: number): CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width: w,
  height: h,
});

export const SIDEBAR_X = 912;
export const ORG_LINKS = [
  "Repositories",
  "Providers",
  "Sign-in clients",
  "New app",
  "Connect repository",
  "Members",
  "Organization settings",
] as const;
export type OrgLink = (typeof ORG_LINKS)[number];

/** Where each organization link sits in the right sidebar, for the pointer. */
export const sidebarLinkY = (link: OrgLink) => 296 + ORG_LINKS.indexOf(link) * 36;
export const SIDEBAR_LINK_X = SIDEBAR_X + 13;
