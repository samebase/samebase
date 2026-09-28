import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { linkStyle } from "@/components/styles";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CONVEX_EU_WEST_REGION,
  CONVEX_US_EAST_REGION,
  formatConvexDeploymentRegionLabel,
  parseConvexDeploymentRegion,
  type ConvexDeploymentRegion,
} from "../../../shared/convexDeploymentRegions";

export function ConvexDeploymentRegionField({
  disabled,
  id,
  label = "Convex production region",
  onValueChange,
  showEuPricing,
  value,
}: {
  disabled: boolean;
  id: string;
  label?: string;
  onValueChange: (value: ConvexDeploymentRegion) => void;
  showEuPricing: boolean;
  value: ConvexDeploymentRegion | null;
}) {
  const euPriceId = showEuPricing && value === CONVEX_EU_WEST_REGION ? `${id}-eu-price` : undefined;

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
        <SelectTrigger aria-describedby={euPriceId} className="w-full text-base" id={id}>
          <SelectValue placeholder="Choose a region">
            {value ? formatConvexDeploymentRegionLabel(value) : "Choose a region"}
          </SelectValue>
        </SelectTrigger>
        <AppSelectContent>
          {/* The API enum also includes regions not yet released in the Convex dashboard. */}
          {([CONVEX_US_EAST_REGION, CONVEX_EU_WEST_REGION] as const).map((region) => (
            <AppSelectItem key={region} value={region}>
              {formatConvexDeploymentRegionLabel(region)}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </Select>
      {showEuPricing && value === CONVEX_EU_WEST_REGION ? (
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
