import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { linkStyle } from "@/components/styles";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CONVEX_EU_WEST_REGION,
  getConvexDeploymentRegionIcon,
  parseConvexDeploymentRegion,
  type ConvexDeploymentRegion,
} from "../../shared/convexDeploymentRegions";

export type ConvexDeploymentRegionOption = {
  name: ConvexDeploymentRegion;
  displayName: string;
  available: boolean;
};

export function ConvexDeploymentRegionField({
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
  disabled: boolean;
  error: boolean;
  id: string;
  isLoading: boolean;
  label?: string;
  onReload: () => void;
  onValueChange: (value: ConvexDeploymentRegion) => void;
  regions: readonly ConvexDeploymentRegionOption[];
  selectionUnavailable: boolean;
  value: ConvexDeploymentRegion | null;
}) {
  const unavailableId = selectionUnavailable ? `${id}-unavailable` : undefined;
  const euPriceId = value === CONVEX_EU_WEST_REGION ? `${id}-eu-price` : undefined;
  const describedBy = [unavailableId, euPriceId].filter(Boolean).join(" ");

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

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        disabled={disabled}
        onValueChange={(nextValue) => {
          const region = parseConvexDeploymentRegion(nextValue);
          if (region) {
            onValueChange(region);
          }
        }}
        value={value ?? ""}
      >
        <SelectTrigger
          aria-describedby={describedBy || undefined}
          className="w-full text-base"
          id={id}
        >
          <SelectValue placeholder="Choose a region">
            {selectedRegion
              ? `${getConvexDeploymentRegionIcon(selectedRegion.name)} ${selectedRegion.displayName}`
              : "Choose a region"}
          </SelectValue>
        </SelectTrigger>
        <AppSelectContent>
          {regions.map((region) => (
            <AppSelectItem disabled={!region.available} key={region.name} value={region.name}>
              {getConvexDeploymentRegionIcon(region.name)} {region.displayName}
              {!region.available ? " (Unavailable)" : ""}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </Select>
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
