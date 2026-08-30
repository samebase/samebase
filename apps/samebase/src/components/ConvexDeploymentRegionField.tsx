import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { linkStyle } from "@/components/styles";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CONVEX_EU_WEST_REGION,
  parseConvexDeploymentRegion,
  type ConvexDeploymentRegion,
} from "../../shared/convexDeploymentRegions";

const NO_SAVED_DEFAULT_VALUE = "no-saved-default";

export type ConvexDeploymentRegionOption = {
  name: ConvexDeploymentRegion;
  displayName: string;
  available: boolean;
};

export function ConvexDeploymentRegionField({
  allowNoSavedDefault = false,
  description,
  disabled,
  error,
  id,
  isLoading,
  label = "Convex production region",
  onReload,
  onValueChange,
  regions,
  selectionUnavailable,
  value,
}: {
  allowNoSavedDefault?: boolean;
  description?: string;
  disabled: boolean;
  error: boolean;
  id: string;
  isLoading: boolean;
  label?: string;
  onReload: () => void;
  onValueChange: (value: ConvexDeploymentRegion | null) => void;
  regions: readonly ConvexDeploymentRegionOption[];
  selectionUnavailable: boolean;
  value: ConvexDeploymentRegion | null;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const unavailableId = selectionUnavailable ? `${id}-unavailable` : undefined;
  const euPriceId = value === CONVEX_EU_WEST_REGION ? `${id}-eu-price` : undefined;
  const describedBy = [descriptionId, unavailableId, euPriceId].filter(Boolean).join(" ");

  if (isLoading) {
    return (
      <div className="grid gap-1.5">
        <Label>{label}</Label>
        <div className="text-xs text-muted-foreground" role="status">
          Loading production regions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid gap-1.5">
        <Label>{label}</Label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-red-600" role="alert">
          <span>Could not load production regions.</span>
          <Button disabled={disabled} onClick={onReload} size="xs" type="button" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const selectedRegion = regions.find((region) => region.name === value);
  const selectValue = value ?? (allowNoSavedDefault ? NO_SAVED_DEFAULT_VALUE : "");

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        disabled={disabled}
        onValueChange={(nextValue) => {
          if (allowNoSavedDefault && nextValue === NO_SAVED_DEFAULT_VALUE) {
            onValueChange(null);
            return;
          }
          const region = parseConvexDeploymentRegion(nextValue);
          if (region) {
            onValueChange(region);
          }
        }}
        value={selectValue}
      >
        <SelectTrigger
          aria-describedby={describedBy || undefined}
          className="w-full text-base"
          id={id}
        >
          <SelectValue placeholder="Choose a region">
            {selectedRegion
              ? selectedRegion.displayName
              : allowNoSavedDefault && value === null
                ? "No saved default"
                : "Choose a region"}
          </SelectValue>
        </SelectTrigger>
        <AppSelectContent>
          {allowNoSavedDefault ? (
            <AppSelectItem value={NO_SAVED_DEFAULT_VALUE}>No saved default</AppSelectItem>
          ) : null}
          {regions.map((region) => (
            <AppSelectItem disabled={!region.available} key={region.name} value={region.name}>
              {region.displayName}
              {!region.available ? " (Unavailable)" : ""}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </Select>
      {description ? (
        <div className="text-xs text-muted-foreground" id={descriptionId}>
          {description}
        </div>
      ) : null}
      {selectionUnavailable ? (
        <div className="text-xs text-red-600" id={unavailableId} role="alert">
          The saved region is not available. Choose another region.
        </div>
      ) : null}
      {value === CONVEX_EU_WEST_REGION ? (
        <div
          aria-live="polite"
          className="text-xs leading-5 text-muted-foreground"
          id={euPriceId}
          role="status"
        >
          EU usage costs 1.3 times US usage. Included usage for Starter and Professional plans does
          not apply to EU deployments. See{" "}
          <a
            className={linkStyle}
            href="https://www.convex.dev/pricing"
            rel="noreferrer noopener"
            target="_blank"
          >
            Convex pricing
          </a>
          .
        </div>
      ) : null}
    </div>
  );
}
