import { createContext, useContext } from "react";
import { api } from "../../convex/_generated/api";
import type { OrganizationRouteSection } from "@/lib/organizationRoutes";

export type ViewerOrganization = (typeof api.organizations.listForViewer)["_returnType"][number];

export type AppOrganizationSurface =
  | { kind: "none" }
  | { kind: "organizations" }
  | { kind: "allRepositories" }
  | { kind: "account" }
  | {
      kind: "organization";
      owner: string;
      section: OrganizationRouteSection;
      source: "organization" | "repository";
    };

type OrganizationContextValue = {
  organizations: ViewerOrganization[] | undefined;
  surface: AppOrganizationSurface;
};

export const OrganizationContext = createContext<OrganizationContextValue | null>(null);

function readOrganizationSection(segments: string[]): OrganizationRouteSection | null {
  if (segments.length === 2 || (segments.length === 3 && segments[2] === "repositories")) {
    return "repositories";
  }
  if (segments.length === 3 && segments[2] === "providers") {
    return "providers";
  }
  if (segments.length === 3 && segments[2] === "new-app") {
    return "new-app";
  }
  if (segments.length === 3 && segments[2] === "connect-repo") {
    return "connect-repo";
  }
  if (segments.length === 3 && segments[2] === "settings") {
    return "settings";
  }
  if (segments.length === 4 && segments[2] === "settings" && segments[3] === "members") {
    return "members";
  }
  return null;
}

export function readAppOrganizationSurface(pathname: string): AppOrganizationSurface {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments[0] === "settings") {
    return { kind: "account" };
  }
  if (segments[0] === "repo") {
    if (segments.length === 1) {
      return { kind: "allRepositories" };
    }
    if (segments.length >= 3) {
      return {
        kind: "organization",
        owner: segments[1],
        section: "repositories",
        source: "repository",
      };
    }
    return { kind: "none" };
  }
  if (segments[0] === "org" && segments.length === 1) {
    return { kind: "organizations" };
  }
  if (segments[0] !== "org" || segments.length < 2) {
    return { kind: "none" };
  }

  const section = readOrganizationSection(segments);
  if (section === null) {
    return { kind: "none" };
  }
  return {
    kind: "organization",
    owner: segments[1],
    section,
    source: "organization",
  };
}

export function findViewerOrganization(
  organizations: ViewerOrganization[],
  owner: string,
): ViewerOrganization | null {
  const normalizedOwner = owner.trim().toLowerCase();
  return (
    organizations.find(
      (organization) => organization.githubOwnerLogin.toLowerCase() === normalizedOwner,
    ) ?? null
  );
}

export function useOrganizationContext(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (context === null) {
    throw new Error("Organization context is missing its provider.");
  }
  return context;
}
