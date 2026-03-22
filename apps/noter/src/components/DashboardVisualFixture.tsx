import {
  ChevronDownIcon,
  GitHubLogoIcon,
  PersonIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Button } from "@/components/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog";
import { DashboardSidebarSection } from "@/components/DashboardSidebarSection";
import { DashboardWorkspaceFrame } from "@/components/DashboardWorkspaceFrame";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { Input } from "@/components/input";
import { useState } from "react";

export type DashboardVisualMode = "dashboard-sidebar";

const PROJECTS = [
  {
    owner: "noter-md",
    name: "research",
    lastUpdated: "Updated 4 minutes ago",
    branches: [
      { name: "main", commit: "0510fbf", meta: "#124" },
      { name: "codex/research", commit: "8cf40bb", meta: "+2" },
      { name: "codex/playground", commit: "acbbc19", meta: "0" },
    ],
  },
  {
    owner: "noter-md",
    name: "customer-portal",
    lastUpdated: "Updated 19 minutes ago",
    branches: [
      { name: "main", commit: "71ca5d4", meta: "#91" },
      { name: "release", commit: "3d95f2a", meta: "0" },
      { name: "staging", commit: "a18f0c2", meta: "+1" },
    ],
  },
  {
    owner: "noter-md",
    name: "starter-template",
    lastUpdated: "Updated 1 hour ago",
    branches: [
      { name: "main", commit: "6e08dc1", meta: "#12" },
      { name: "codex/template", commit: "aa3814d", meta: "0" },
    ],
  },
] as const;

const PROVIDERS = [
  {
    name: "GitHub",
    status: "Connected as noter-md (API key)",
    icon: <GitHubLogoIcon className="h-4 w-4" />,
    actions: ["Disconnect"],
  },
  {
    name: "Convex",
    status: "Connected to noter-dev (API key)",
    icon: <span className="text-xs font-medium">CVX</span>,
    actions: ["Disconnect"],
  },
  {
    name: "Cloudflare",
    status: "Connected with MCP OAuth",
    icon: <span className="text-xs font-medium">CF</span>,
    actions: ["Check token", "Disconnect"],
  },
  {
    name: "Codex",
    status: "Not connected in Daytona",
    icon: <span className="text-xs font-medium">CX</span>,
    actions: ["Connect in Daytona"],
  },
] as const;

export function DashboardVisualFixture({
  mode,
}: {
  mode: DashboardVisualMode;
}) {
  const [accountSectionOpen, setAccountSectionOpen] = useState(true);
  const [providersSectionOpen, setProvidersSectionOpen] = useState(false);
  const [newProjectSectionOpen, setNewProjectSectionOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);

  return (
    <div
      data-testid="dashboard-visual-fixture"
      className="h-screen w-screen overflow-hidden bg-background text-foreground"
    >
      <DashboardWorkspaceFrame
        dataTestId={mode}
        headerTitle="Projects"
        headerSubtitle={`${PROJECTS.length} projects`}
        sidebarContent={
          <>
            <Dialog
              open={accountDialogOpen}
              onOpenChange={setAccountDialogOpen}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Account</DialogTitle>
                  <DialogDescription>
                    Sign-in details for this session.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      Sign-in method
                    </span>
                    <span className="font-medium">Google</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">nicu@noter.md</span>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <DashboardSidebarSection
              title="Account"
              open={accountSectionOpen}
              onOpenChange={setAccountSectionOpen}
            >
              <div className="flex w-full items-center justify-between gap-2 text-sm font-medium">
                <span className="truncate">Nicu</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="rounded-ui"
                    >
                      <PersonIcon className="h-5 w-5" />
                      <span className="sr-only">Toggle user menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Nicu</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setAccountDialogOpen(true)}
                    >
                      Account details
                    </DropdownMenuItem>
                    <DropdownMenuItem>Sign out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </DashboardSidebarSection>

            <DashboardSidebarSection
              title="Providers"
              open={providersSectionOpen}
              onOpenChange={setProvidersSectionOpen}
            >
              <div className="space-y-3">
                {PROVIDERS.map((provider) => (
                  <div
                    key={provider.name}
                    className="corner-notch-1 border border-border/50 bg-background p-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-5 w-11 shrink-0 items-center justify-center">
                        {provider.icon}
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden text-left">
                        <div className="text-sm font-medium">
                          {provider.name}
                        </div>
                        <div className="break-words text-xs leading-5 text-muted-foreground">
                          {provider.status}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      {provider.actions.map((actionLabel) => (
                        <Button
                          key={`${provider.name}-${actionLabel}`}
                          variant="outline"
                          size="sm"
                          className="w-full justify-center"
                        >
                          {actionLabel}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </DashboardSidebarSection>

            <DashboardSidebarSection
              title="New Project"
              open={newProjectSectionOpen}
              onOpenChange={setNewProjectSectionOpen}
            >
              <div className="flex flex-col items-start gap-2">
                <ButtonGroup className="w-full">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="gap-2" variant="outline">
                        App
                        <span className="sr-only">Choose template</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem>App</DropdownMenuItem>
                      <DropdownMenuItem>Agent</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button>Create app</Button>
                  <ButtonGroupSeparator className="bg-primary-foreground/30" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="px-2" aria-label="More actions">
                        <span className="text-sm leading-none">+</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Connect existing repo</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ButtonGroup>
                <Input readOnly value="research-lab" className="w-full" />
              </div>
            </DashboardSidebarSection>
          </>
        }
      >
        <div className="space-y-3">
          {PROJECTS.map((project) => (
            <FixtureVaultCard key={project.name} project={project} />
          ))}
        </div>
      </DashboardWorkspaceFrame>
    </div>
  );
}

function FixtureVaultCard({ project }: { project: (typeof PROJECTS)[number] }) {
  return (
    <section className="relative corner-notch-1 border p-4">
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Remove vault ${project.owner}/${project.name}`}
        className="absolute right-4 top-4 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <TrashIcon className="h-4 w-4" aria-hidden="true" />
      </Button>

      <div className="space-y-3">
        <div className="flex flex-col items-start pr-10">
          <div className="flex min-w-0 flex-col items-start">
            <span className="text-sm text-muted-foreground">
              {project.owner}/
            </span>
            <h2 className="font-semibold">
              <span className="min-w-0 truncate">{project.name}</span>
            </h2>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>{project.lastUpdated}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
            Branches
          </p>
          <div className="overflow-hidden corner-notch-1 border border-border/60 bg-muted/20">
            {project.branches.map((branch) => (
              <div
                key={`${project.name}-${branch.name}`}
                className="flex items-start gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="block truncate text-sm text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4">
                    {branch.name}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
                    <span className="font-mono">{branch.commit}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{branch.meta}</span>
                  </div>
                </div>
                <span className="w-4 pt-1 text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">
                  0
                </span>
              </div>
            ))}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-auto gap-1 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          Developer tools
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </section>
  );
}
