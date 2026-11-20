import { resourceTypeTags, resourceTypeUI } from "@samebase/alchemy-kit/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlchemyIsometricIcon } from "@/components/AlchemyIsometricIcon";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { resourceTypePresentation } from "@/components/resourceTypePresentation";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Rows added to the page each time its end comes near. */
const CHUNK = 150;

const TYPES = resourceTypeTags.map((tag) => {
  const ui = resourceTypeUI(tag);
  return {
    tag,
    ui,
    provider: tag.split(".")[0],
    search: `${ui.name}\n${tag}`.toLowerCase(),
  };
});

type ResourceTypeRow = (typeof TYPES)[number];

const formatCount = (count: number) => count.toLocaleString("en-US");

/** Each value with its number of types, most first, then by name. */
function countBy(key: (type: ResourceTypeRow) => string) {
  const counts = new Map<string, number>();
  for (const type of TYPES) {
    counts.set(key(type), (counts.get(key(type)) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const selectItems = (all: string, counts: [string, number][]) => [
  { value: "", label: all },
  ...counts.map(([value, count]) => ({ value, label: `${value} (${formatCount(count)})` })),
];

const PROVIDERS = selectItems(
  "All providers",
  countBy((type) => type.provider),
);
const CATEGORIES = selectItems(
  "All categories",
  countBy((type) => type.ui.category),
);

/**
A group heading, then its types in tag order. Groups with the most types come first. An empty
`provider` or `category` is all of them.
*/
function listItems(query: string, provider: string, category: string) {
  const needle = query.trim().toLowerCase();
  const groups = new Map<string, ResourceTypeRow[]>();
  for (const type of TYPES) {
    if (
      (!provider || type.provider === provider) &&
      (!category || type.ui.category === category) &&
      type.search.includes(needle)
    ) {
      const group = groups.get(type.provider);
      if (group) {
        group.push(type);
      } else {
        groups.set(type.provider, [type]);
      }
    }
  }
  return [...groups]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .flatMap(([name, types]) => [{ group: name, count: types.length }, ...types]);
}

/**
Calls `onVisible` once when it comes within 1200px of the viewport. The page mounts a new one for
each chunk, and a new observer reports its first state, so a sentinel still in range loads the next
chunk too.
*/
function LoadMore({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = ref.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          onVisible();
        }
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onVisible]);
  return <div ref={ref} aria-hidden="true" />;
}

function FilterSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: ReturnType<typeof selectItems>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange} items={items}>
      <SelectTrigger aria-label={label} className="text-base">
        <SelectValue />
      </SelectTrigger>
      <AppSelectContent>
        {items.map((item) => (
          <AppSelectItem key={item.value} value={item.value}>
            {item.label}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </Select>
  );
}

/** Every Alchemy resource type with its diagram icon, by provider. */
export function ResourceTypesPage() {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(CHUNK);
  const items = useMemo(() => listItems(query, provider, category), [query, provider, category]);
  const shown = items.filter((item) => "tag" in item).length;
  const loadMore = useCallback(() => setLimit((current) => current + CHUNK), []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold @2xl:text-2xl">Resource types</h1>
      <div className="my-3 flex flex-wrap gap-2">
        <Input
          type="search"
          aria-label="Search names and tags"
          placeholder="Search"
          className="basis-60 grow"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(CHUNK);
          }}
        />
        <FilterSelect
          label="Provider"
          items={PROVIDERS}
          value={provider}
          onChange={(value) => {
            setProvider(value);
            setLimit(CHUNK);
          }}
        />
        <FilterSelect
          label="Category"
          items={CATEGORIES}
          value={category}
          onChange={(value) => {
            setCategory(value);
            setLimit(CHUNK);
          }}
        />
      </div>
      <p className="mb-2 text-muted-foreground">{formatCount(shown)} types</p>
      <div className="border-t">
        {items.slice(0, limit).map((item) =>
          "group" in item ? (
            <h2
              key={item.group}
              className="flex justify-between border border-t-0 bg-muted px-2.5 py-2"
            >
              {item.group}
              <span className="text-muted-foreground">{formatCount(item.count)}</span>
            </h2>
          ) : (
            <div key={item.tag} className="flex items-center gap-3 border border-t-0 px-2.5 py-1.5">
              <AlchemyIsometricIcon
                resourceType={item.tag}
                category={item.ui.category}
                icon={item.ui.icon}
              />
              <div className="grid min-w-0 flex-1 gap-x-3 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_7rem] @2xl:items-center">
                <div className="flex items-center gap-2 font-medium">
                  {resourceTypePresentation(item.tag).icon}
                  <span className="max-lines-3 min-w-0">{item.ui.name}</span>
                </div>
                <code className="text-xs break-all">{item.tag}</code>
                <span className="text-muted-foreground">{item.ui.category}</span>
              </div>
            </div>
          ),
        )}
      </div>
      {limit < items.length ? <LoadMore key={limit} onVisible={loadMore} /> : null}
    </main>
  );
}
