import { useEffect, useState } from "react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { Input } from "@/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/sheet";
import { buildPullRequestLabelStyle } from "@/lib/pullRequestLabels";
import {
  setVaultBranchFilterLabelIncluded,
  type VaultBranchFilterOption,
  type VaultBranchFilters,
} from "@/lib/vaultBranchFilters";

function matchesOptionSearch(option: VaultBranchFilterOption, search: string) {
  if (search.length === 0) {
    return true;
  }

  return option.name.toLowerCase().includes(search.toLowerCase());
}

/**
 * Keep the narrow-sheet treatment for touch-first devices only so desktop
 * browsers still get the lighter popover, even in smaller windows.
 */
function useUsesTouchSheet() {
  const [usesTouchSheet, setUsesTouchSheet] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  });

  useEffect(() => {
    const touchDeviceQuery = window.matchMedia(
      "(hover: none) and (pointer: coarse)",
    );
    const updateUsesTouchSheet = () => {
      setUsesTouchSheet(touchDeviceQuery.matches);
    };

    updateUsesTouchSheet();
    touchDeviceQuery.addEventListener("change", updateUsesTouchSheet);
    return () =>
      touchDeviceQuery.removeEventListener("change", updateUsesTouchSheet);
  }, []);

  return usesTouchSheet;
}

function VaultBranchFiltersPanel({
  value,
  options,
  onChange,
}: {
  value: VaultBranchFilters;
  options: VaultBranchFilterOption[];
  onChange: (nextValue: VaultBranchFilters) => void;
}) {
  const [labelSearch, setLabelSearch] = useState("");
  const hasCustomFilters =
    value.hiddenLabels.length > 0 ||
    value.includeDrafts === true ||
    value.includeNoLabel === false;
  const visibleOptions = options.filter((option) =>
    matchesOptionSearch(option, labelSearch.trim()),
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">Filters</p>
        {hasCustomFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() =>
              onChange({
                hiddenLabels: [],
                includeDrafts: false,
                includeNoLabel: true,
              })
            }
          >
            Reset all
          </Button>
        ) : null}
      </div>

      {options.length > 0 ? (
        <div className="space-y-2">
          <Input
            value={labelSearch}
            onChange={(event) => setLabelSearch(event.target.value)}
            placeholder="Filter labels"
            className="h-8 text-sm"
          />
          <div className="max-h-64 overflow-y-auto corner-notch-1 border border-border/60 bg-muted/10">
            {visibleOptions.map((option) => (
              <label
                key={option.key}
                className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
              >
                <Checkbox
                  checked={option.included}
                  onCheckedChange={(checked) => {
                    if (option.isNoLabel) {
                      onChange({
                        ...value,
                        includeNoLabel: checked === true,
                      });
                      return;
                    }

                    onChange({
                      ...value,
                      hiddenLabels: setVaultBranchFilterLabelIncluded({
                        hiddenLabels: value.hiddenLabels,
                        labelName: option.name,
                        included: checked === true,
                      }),
                    });
                  }}
                />
                <div className="min-w-0 flex-1">
                  <Badge
                    variant="outline"
                    className="h-5 max-w-full px-1.5 py-0 text-[10px] font-medium"
                    style={buildPullRequestLabelStyle(option.color)}
                    title={option.name}
                  >
                    <span className="truncate">{option.name}</span>
                  </Badge>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground/80">
                  {option.count}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <label className="flex min-h-11 cursor-pointer items-start gap-3 corner-notch-1 border border-border/60 px-3 py-2.5">
        <Checkbox
          checked={value.includeDrafts}
          onCheckedChange={(checked) =>
            onChange({
              ...value,
              includeDrafts: checked === true,
            })
          }
        />
        <div className="space-y-1">
          <p className="text-sm font-medium leading-none">Include drafts</p>
        </div>
      </label>
    </div>
  );
}

export function VaultBranchFiltersControl({
  value,
  options,
  onChange,
}: {
  value: VaultBranchFilters;
  options: VaultBranchFilterOption[];
  onChange: (nextValue: VaultBranchFilters) => void;
}) {
  const usesTouchSheet = useUsesTouchSheet();
  const [isOpen, setIsOpen] = useState(false);
  const trigger = (
    <Button type="button" variant="outline" size="sm" className="h-7 px-2.5">
      Filters
    </Button>
  );

  if (usesTouchSheet) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-hidden">
          <SheetTitle className="sr-only">Filters</SheetTitle>
          <VaultBranchFiltersPanel
            value={value}
            options={options}
            onChange={onChange}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[22rem] max-w-[calc(100vw-1rem)] p-0"
      >
        <VaultBranchFiltersPanel
          value={value}
          options={options}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  );
}
