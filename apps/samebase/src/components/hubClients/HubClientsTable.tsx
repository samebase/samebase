import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnGroupingFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createGroupedRowModel,
  type ExpandedState,
  filterFn_arrHas,
  type Row,
  rowExpandingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  Ban,
  Bot,
  ChevronRight,
  Copy,
  ExternalLink,
  Github,
  Laptop,
  MoreHorizontal,
  PlusCircle,
  Search,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { formatTime, type HubClient, ownerOf } from "@/components/hubClients/hubClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatRelativeTimeAgo, formatRelativeTimeUntil } from "@/lib/formatRelativeTime";
import { HUB_CLIENTS_GROUP_VALUES, type HubClientsRouteSearch } from "@/routeSearch/hubClients";
import type { SearchPatch } from "@/routing/searchFlags";

/** A client expires this close to its removal time gets the amber badge. */
const EXPIRY_WARNING_MS = 48 * 60 * 60 * 1000;

const features = tableFeatures({
  columnFacetingFeature,
  columnFilteringFeature,
  columnGroupingFeature,
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filteredRowModel: createFilteredRowModel(),
  groupedRowModel: createGroupedRowModel(),
  filterFns: { arrHas: filterFn_arrHas },
});

const columnHelper = createColumnHelper<typeof features, HubClient>();

/**
The filters, each a column that only filters and groups. The URL holds the selected values under the
same key, comma-separated.
*/
const FACETS = [
  { id: "owner", label: "Owner", options: null },
  {
    id: "stage",
    label: "Stage",
    options: [
      { value: "production", label: "Production" },
      { value: "preview", label: "Preview" },
      { value: "development", label: "Development" },
    ],
  },
  {
    id: "registered",
    label: "Registered",
    options: [
      { value: "github", label: "GitHub Actions" },
      { value: "laptop", label: "Laptop token" },
    ],
  },
  {
    id: "signIn",
    label: "Sign-in",
    options: [
      { value: "yes", label: "Has signed in" },
      { value: "never", label: "Never signed in" },
    ],
  },
] as const;

type FacetId = (typeof FACETS)[number]["id"];

const filterColumns = columnHelper.columns([
  columnHelper.accessor((client) => ownerOf(client), { id: "owner", filterFn: "arrHas" }),
  columnHelper.accessor((client) => client.registeredBy.githubRepository, { id: "repository" }),
  columnHelper.accessor((client) => client.deploymentType, { id: "stage", filterFn: "arrHas" }),
  columnHelper.accessor((client) => (client.registeredBy.kind === "github" ? "github" : "laptop"), {
    id: "registered",
    filterFn: "arrHas",
  }),
  columnHelper.accessor((client) => (client.lastSignInAt === null ? "never" : "yes"), {
    id: "signIn",
    filterFn: "arrHas",
  }),
]);

/** Stage colors follow Convex's dashboard: production purple, preview orange, development green. */
const STAGE_BADGE_CLASS = {
  production:
    "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:border-purple-400/30 dark:bg-purple-400/10 dark:text-purple-300",
  preview:
    "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:border-orange-400/30 dark:bg-orange-400/10 dark:text-orange-300",
  development:
    "border-green-500/30 bg-green-500/10 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-300",
} as const;

const STAGE_DOT_CLASS = {
  production: "size-2 rounded-full bg-purple-500",
  preview: "size-2 rounded-full bg-orange-500",
  development: "size-2 rounded-full bg-green-500",
} as const;

const STAGE_ORDER = { production: 0, preview: 1, development: 2 } as const;

/** The hub names a client after its stage: `prod`, `pr-<number>`, or `development`. */
function stageLabel(client: HubClient) {
  switch (client.deploymentType) {
    case "production":
      return "Production";
    case "preview":
      return `PR ${client.clientName.replace(/^pr-/, "")}`;
    case "development":
      return "Development";
    default:
      return client.deploymentType satisfies never;
  }
}

function StageBadge({ client }: { client: HubClient }) {
  return (
    <Badge variant="outline" className={STAGE_BADGE_CLASS[client.deploymentType]}>
      {stageLabel(client)}
    </Badge>
  );
}

function BlockedBadge() {
  return (
    <Badge variant="destructive">
      <Ban />
      Blocked
    </Badge>
  );
}

function RegisteredBy({ client }: { client: HubClient }) {
  const { registeredBy } = client;
  if (registeredBy.kind === "initial_access_token") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Laptop className="size-3.5 text-muted-foreground" />
        Laptop token
      </span>
    );
  }
  const Icon = registeredBy.githubActorLogin.endsWith("[bot]") ? Bot : Github;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 text-muted-foreground" />
      {registeredBy.githubActorLogin}
    </span>
  );
}

/** The values of one filter in the URL, such as `preview,development`. */
const readFilterValues = (value: string | undefined) =>
  value === undefined ? [] : value.split(",").filter((part) => part.length > 0);

/**
The clients of the identity hub, filtered and grouped by the page's URL search, grouped by repository
by default. The admin page lists every owner with the owner filter and grouping; an organization's
page lists its own repositories without them. Each page adds its own menu items.
*/
export function HubClientsTable({
  clients,
  limitReached,
  now,
  search,
  onSearchChange,
  owners,
  blocked,
  clientActions,
  groupActions,
}: {
  clients: readonly HubClient[];
  limitReached: boolean;
  now: number;
  search: HubClientsRouteSearch;
  onSearchChange: (patch: SearchPatch<HubClientsRouteSearch>) => void;
  /** The owner filter and the owner grouping, off on a page of one owner. */
  owners: boolean;
  blocked: (client: HubClient) => boolean;
  /** The page's own menu items of a client, after the copy items. */
  clientActions: (client: HubClient) => ReactNode;
  /** The page's own menu items of a group, after Open on GitHub. */
  groupActions: (first: HubClient, group: "repository" | "owner") => ReactNode;
}) {
  const [query, setQuery] = useState(search.q ?? "");
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const group = search.group ?? "repository";
  const groupColumn = group === "owner" ? "owner" : "repository";
  const facets = FACETS.filter((facet) => owners || facet.id !== "owner");

  // The grouped row model keeps the order in which each group's first row appears, so the rows are
  // sorted by their group's newest client first, then by stage, PR number, app, and age.
  const data = useMemo(() => {
    const needle = (search.q ?? "").toLowerCase();
    const matching = clients.filter(
      (client) =>
        needle === "" ||
        [
          client.registeredBy.githubRepository,
          client.registeredBy.app,
          client.redirectUri,
          client.clientId,
          client.clientName,
          client.registeredBy.kind === "github" ? client.registeredBy.githubActorLogin : "",
        ].some((text) => text.toLowerCase().includes(needle)),
    );
    const groupKey = (client: HubClient) =>
      group === "owner" ? ownerOf(client) : client.registeredBy.githubRepository;
    const newest = new Map<string, number>();
    for (const client of matching) {
      newest.set(groupKey(client), Math.max(newest.get(groupKey(client)) ?? 0, client.createdAt));
    }
    const prNumber = (client: HubClient) =>
      client.deploymentType === "preview" ? Number(client.clientName.replace(/^pr-/, "")) : 0;
    return matching.sort(
      (a, b) =>
        (group === "none" ? 0 : (newest.get(groupKey(b)) ?? 0) - (newest.get(groupKey(a)) ?? 0)) ||
        groupKey(a).localeCompare(groupKey(b)) ||
        STAGE_ORDER[a.deploymentType] - STAGE_ORDER[b.deploymentType] ||
        prNumber(b) - prNumber(a) ||
        a.registeredBy.app.localeCompare(b.registeredBy.app) ||
        b.createdAt - a.createdAt ||
        a.clientId.localeCompare(b.clientId),
    );
  }, [clients, search.q, group]);

  // The table syncs its store when a state object changes identity, so these stay stable between
  // renders that do not change the URL.
  const columnFilters = useMemo(
    () =>
      FACETS.flatMap((facet) => {
        const values = readFilterValues(search[facet.id]);
        return values.length === 0 ? [] : [{ id: facet.id, value: values }];
      }),
    [search],
  );
  const grouping = useMemo(() => (group === "none" ? [] : [groupColumn]), [group, groupColumn]);

  const table = useTable({
    features,
    columns: filterColumns,
    data,
    getRowId: (client) => client.clientId,
    state: {
      columnFilters,
      grouping,
      expanded,
    },
    onExpandedChange: setExpanded,
    // Groups stay open when a filter changes; by default the table collapses them all.
    autoResetExpanded: false,
  });

  const setFilter = (id: FacetId, values: readonly string[]) => {
    onSearchChange({ [id]: values.length ? values.join(",") : null });
  };

  const rows = table.getRowModel().rows;
  const leafCount = table.getFilteredRowModel().rows.length;
  const anyFilter = search.q !== undefined || columnFilters.length > 0;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full @3xl:max-w-60">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search clients"
            className="pl-8"
            placeholder="Search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              onSearchChange({ q: event.target.value.trim() === "" ? null : event.target.value });
            }}
          />
        </div>
        {facets.map((facet) => {
          // @ts-expect-error Every facet id names a column of `filterColumns`, but `getColumn` takes any string.
          const counts = table.getColumn(facet.id).getFacetedUniqueValues();
          const options =
            facet.options ??
            Array.from(new Set(clients.map(ownerOf)))
              .sort()
              .map((owner) => ({ value: owner, label: owner }));
          return (
            <FacetFilter
              key={facet.id}
              label={facet.label}
              options={options}
              counts={counts}
              selected={readFilterValues(search[facet.id])}
              onChange={(values) => setFilter(facet.id, values)}
            />
          );
        })}
        {anyFilter ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              onSearchChange({ q: null, owner: null, stage: null, registered: null, signIn: null });
            }}
          >
            Reset
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          Group
          <ToggleGroup
            variant="outline"
            size="sm"
            value={group}
            onValueChange={(next) =>
              onSearchChange({
                group: HUB_CLIENTS_GROUP_VALUES.find((value) => value === next) ?? null,
              })
            }
          >
            <ToggleGroupItem value="repository">Repository</ToggleGroupItem>
            {owners ? <ToggleGroupItem value="owner">Owner</ToggleGroupItem> : null}
            <ToggleGroupItem value="none">None</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <Table className="mt-4 table-fixed">
        <TableHeader>
          <TableRow>
            {/* Narrow panes keep the four detail columns at zero width instead of removing them:
            the group row spans them, so a removed cell would move the menu into the wrong column. */}
            <TableHead className="@3xl:w-[32%]">Client</TableHead>
            <TableHead className="w-0 overflow-hidden px-0 @3xl:w-[24%] @3xl:px-2">
              Return address
            </TableHead>
            <TableHead className="w-0 overflow-hidden px-0 @3xl:w-[18%] @3xl:px-2">
              Registered by
            </TableHead>
            <TableHead className="w-0 overflow-hidden px-0 @3xl:w-[12%] @3xl:px-2">
              Last sign-in
            </TableHead>
            <TableHead className="w-0 overflow-hidden px-0 @3xl:w-[10%] @3xl:px-2">
              Expires
            </TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) =>
            row.getIsGrouped() ? (
              <GroupRow
                key={row.id}
                row={row}
                group={groupColumn}
                now={now}
                blocked={row.getLeafRows().some((leaf) => blocked(leaf.original))}
                groupActions={groupActions}
              />
            ) : (
              <ClientRow
                key={row.id}
                client={row.original}
                indented={group !== "none"}
                showRepository={group !== "repository"}
                now={now}
                blocked={blocked(row.original)}
                open={openClientId === row.original.clientId}
                onToggle={() =>
                  setOpenClientId((current) =>
                    current === row.original.clientId ? null : row.original.clientId,
                  )
                }
                clientActions={clientActions}
              />
            ),
          )}
        </TableBody>
      </Table>
      {clients.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No clients.</p>
      ) : leafCount === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No clients match.</p>
      ) : limitReached ? (
        <p className="mt-4 text-sm text-muted-foreground">The newest {clients.length} clients.</p>
      ) : null}
    </>
  );
}

function FacetFilter({
  label,
  options,
  counts,
  selected,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  counts: Map<unknown, number>;
  selected: readonly string[];
  onChange: (values: readonly string[]) => void;
}) {
  const selectedLabels = options.filter((option) => selected.includes(option.value));
  return (
    <Popover>
      <PopoverTrigger asChild nativeButton>
        <Button variant="outline" size="sm" className="border-dashed">
          <PlusCircle />
          {label}
          {selectedLabels.length === 0 ? null : (
            <span className="ml-1 flex gap-1 border-l pl-2">
              {selectedLabels.length > 2 ? (
                <Badge variant="secondary">{selectedLabels.length} selected</Badge>
              ) : (
                selectedLabels.map((option) => (
                  <Badge key={option.value} variant="secondary">
                    {option.label}
                  </Badge>
                ))
              )}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-0 p-1">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          const id = `hub-clients-${label}-${option.value}`;
          return (
            <Label
              key={option.value}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 font-normal hover:bg-accent"
            >
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(
                    next === true
                      ? [...selected, option.value]
                      : selected.filter((value) => value !== option.value),
                  )
                }
              />
              {option.label}
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {counts.get(option.value) ?? 0}
              </span>
            </Label>
          );
        })}
        {selected.length === 0 ? null : (
          <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function GroupRow({
  row,
  group,
  now,
  blocked,
  groupActions,
}: {
  row: Row<typeof features, HubClient>;
  group: "repository" | "owner";
  now: number;
  blocked: boolean;
  groupActions: (first: HubClient, group: "repository" | "owner") => ReactNode;
}) {
  const leaves = row.getLeafRows().map((leaf) => leaf.original);
  const first = leaves[0];
  const lastSignIns = leaves.flatMap((client) =>
    client.lastSignInAt === null ? [] : [client.lastSignInAt],
  );
  const [owner, name] = first.registeredBy.githubRepository.split("/");
  return (
    <TableRow
      className="cursor-pointer bg-muted/50 hover:bg-muted"
      onClick={() => row.toggleExpanded()}
    >
      <TableCell colSpan={5} className="whitespace-normal">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ChevronRight
            className={
              row.getIsExpanded()
                ? "size-4 rotate-90 text-muted-foreground transition-transform"
                : "size-4 text-muted-foreground transition-transform"
            }
          />
          {group === "repository" ? (
            <span>
              <span className="text-muted-foreground">{owner} / </span>
              <span className="font-semibold">{name}</span>
            </span>
          ) : (
            <span className="font-semibold">{owner}</span>
          )}
          {blocked ? <BlockedBadge /> : null}
          {(["production", "preview", "development"] as const).map((stage) => {
            const count = leaves.filter((client) => client.deploymentType === stage).length;
            return count === 0 ? null : (
              <span key={stage} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={STAGE_DOT_CLASS[stage]} />
                {count} {stage}
              </span>
            );
          })}
          <span className="ml-auto hidden text-xs text-muted-foreground @3xl:inline">
            {lastSignIns.length === 0
              ? "No sign-ins"
              : `Last sign-in ${formatRelativeTimeAgo(Math.max(...lastSignIns), now)}`}
          </span>
        </span>
      </TableCell>
      <TableCell onClick={(event) => event.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild nativeButton>
            <Button
              aria-label={`${group === "repository" ? first.registeredBy.githubRepository : owner} actions`}
              size="icon-sm"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-none shadow-none">
            {group === "repository" ? (
              <DropdownMenuItem
                render={
                  <a
                    href={`https://github.com/${first.registeredBy.githubRepository}`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <ExternalLink />
                Open on GitHub
              </DropdownMenuItem>
            ) : null}
            {groupActions(first, group)}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function ClientRow({
  client,
  indented,
  showRepository,
  now,
  blocked,
  open,
  onToggle,
  clientActions,
}: {
  client: HubClient;
  indented: boolean;
  showRepository: boolean;
  now: number;
  blocked: boolean;
  open: boolean;
  onToggle: () => void;
  clientActions: (client: HubClient) => ReactNode;
}) {
  const copy = (value: string) => {
    void navigator.clipboard.writeText(value);
  };
  return (
    <>
      <TableRow
        className="cursor-pointer"
        data-state={open ? "selected" : undefined}
        onClick={onToggle}
      >
        <TableCell className={indented ? "truncate pl-4 @3xl:pl-9" : "truncate"}>
          <span className="flex items-center gap-2">
            <StageBadge client={client} />
            {blocked ? <BlockedBadge /> : null}
            <span className="truncate">
              {showRepository ? (
                <span className="text-muted-foreground">
                  {client.registeredBy.githubRepository.split("/")[1]} ·{" "}
                </span>
              ) : null}
              {client.registeredBy.app}
            </span>
          </span>
          {/* Narrow panes hide the other columns, so the address and the sign-in move here. */}
          <span className="mt-1 block truncate text-xs text-muted-foreground @3xl:hidden">
            {new URL(client.redirectUri).host} ·{" "}
            {client.lastSignInAt === null
              ? "never signed in"
              : `signed in ${formatRelativeTimeAgo(client.lastSignInAt, now)}`}
            {client.removeAt !== null && client.removeAt - now < EXPIRY_WARNING_MS
              ? ` · expires ${formatRelativeTimeUntil(client.removeAt, now)}`
              : null}
          </span>
        </TableCell>
        <TableCell
          className="truncate px-0 font-mono text-xs text-muted-foreground @3xl:px-2"
          title={client.redirectUri}
        >
          {new URL(client.redirectUri).host}
        </TableCell>
        <TableCell className="truncate px-0 @3xl:px-2">
          <RegisteredBy client={client} />
        </TableCell>
        <TableCell className="truncate px-0 @3xl:px-2">
          {client.lastSignInAt === null ? (
            <span className="text-muted-foreground">Never</span>
          ) : (
            formatRelativeTimeAgo(client.lastSignInAt, now)
          )}
        </TableCell>
        <TableCell className="overflow-hidden px-0 @3xl:px-2">
          {client.removeAt === null ? (
            <span className="text-muted-foreground">Never</span>
          ) : client.removeAt - now < EXPIRY_WARNING_MS ? (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
            >
              {formatRelativeTimeUntil(client.removeAt, now)}
            </Badge>
          ) : (
            <span className="text-muted-foreground">
              {formatRelativeTimeUntil(client.removeAt, now)}
            </span>
          )}
        </TableCell>
        <TableCell onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild nativeButton>
              <Button aria-label={`${client.clientId} actions`} size="icon-sm" variant="ghost">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-none shadow-none">
              <DropdownMenuItem onSelect={() => copy(client.clientId)}>
                <Copy />
                Copy client id
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => copy(client.appId)}>
                <Copy />
                Copy app id
              </DropdownMenuItem>
              {clientActions(client)}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={6}
            className={indented ? "pl-4 whitespace-normal @3xl:pl-9" : "whitespace-normal"}
          >
            <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Client id</dt>
              <dd className="font-mono text-xs">{client.clientId}</dd>
              <dt className="text-muted-foreground">App id</dt>
              <dd className="font-mono text-xs break-all">{client.appId}</dd>
              <dt className="text-muted-foreground">Return address</dt>
              <dd className="font-mono text-xs break-all">{client.redirectUri}</dd>
              <dt className="text-muted-foreground">Repository</dt>
              <dd>
                {client.registeredBy.githubRepository}{" "}
                <span className="text-muted-foreground">
                  {client.registeredBy.githubRepositoryDatabaseId}
                </span>
              </dd>
              <dt className="text-muted-foreground">Owner id</dt>
              <dd>{client.registeredBy.githubOwnerId}</dd>
              <dt className="text-muted-foreground">Registered</dt>
              <dd>
                {formatTime(client.createdAt)}
                {client.registeredBy.kind === "initial_access_token"
                  ? `, token of ${formatTime(client.registeredBy.issuedAt)}`
                  : null}
              </dd>
              <dt className="text-muted-foreground">Last renewed</dt>
              <dd>{formatTime(client.renewedAt)}</dd>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>{client.removeAt === null ? "Never" : formatTime(client.removeAt)}</dd>
            </dl>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
