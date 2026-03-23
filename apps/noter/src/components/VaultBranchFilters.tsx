import { useState } from "react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { Input } from "@/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  buildPullRequestLabelStyle,
  type PullRequestLabelDisplay,
} from "@/lib/pullRequestLabels";
import {
  setVaultBranchFilterHiddenLabel,
  type VaultBranchFilterLabelOption,
  type VaultBranchFilters,
} from "@/lib/vaultBranchFilters";

function matchesLabelSearch(
  label: PullRequestLabelDisplay,
  search: string,
): boolean {
  if (search.length === 0) {
    return true;
  }

  return label.name.toLowerCase().includes(search.toLowerCase());
}

function VaultBranchFiltersPanel({
  value,
  labelOptions,
  onChange,
}: {
  value: VaultBranchFilters;
  labelOptions: VaultBranchFilterLabelOption[];
  onChange: (nextValue: VaultBranchFilters) => void;
}) {
  const [labelSearch, setLabelSearch] = useState("");
  const hasCustomFilters =
    value.hiddenLabels.length > 0 || value.includeDrafts === true;
  const visibleLabelOptions = labelOptions.filter((labelOption) =>
    matchesLabelSearch(labelOption, labelSearch.trim()),
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Filters</p>
          <p className="text-xs text-muted-foreground">
            Hide task labels for this vault and optionally show draft pull
            requests.
          </p>
        </div>
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
              })
            }
          >
            Clear all
          </Button>
        ) : null}
      </div>

      {labelOptions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
            Hide labels
          </p>
          <Input
            value={labelSearch}
            onChange={(event) => setLabelSearch(event.target.value)}
            placeholder="Filter labels"
            className="h-8 text-sm"
          />
          <div className="max-h-64 overflow-y-auto corner-notch-1 border border-border/60 bg-muted/10">
            {visibleLabelOptions.map((labelOption) => (
              <label
                key={labelOption.name}
                className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
              >
                <Checkbox
                  checked={labelOption.selected}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...value,
                      hiddenLabels: setVaultBranchFilterHiddenLabel({
                        hiddenLabels: value.hiddenLabels,
                        labelName: labelOption.name,
                        selected: checked === true,
                      }),
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <Badge
                    variant="outline"
                    className="h-5 max-w-full px-1.5 py-0 text-[10px] font-medium"
                    style={buildPullRequestLabelStyle(labelOption.color)}
                    title={labelOption.name}
                  >
                    <span className="truncate">{labelOption.name}</span>
                  </Badge>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground/80">
                  {labelOption.count}
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
          <p className="text-xs text-muted-foreground">
            Show draft pull requests alongside ready branches in this vault.
          </p>
        </div>
      </label>
    </div>
  );
}

export function VaultBranchFiltersControl({
  value,
  labelOptions,
  onChange,
}: {
  value: VaultBranchFilters;
  labelOptions: VaultBranchFilterLabelOption[];
  onChange: (nextValue: VaultBranchFilters) => void;
}) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const trigger = (
    <Button type="button" variant="outline" size="sm" className="h-7 px-2.5">
      Filters
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-hidden">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <VaultBranchFiltersPanel
            value={value}
            labelOptions={labelOptions}
            onChange={onChange}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <VaultBranchFiltersPanel
          value={value}
          labelOptions={labelOptions}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  );
}
