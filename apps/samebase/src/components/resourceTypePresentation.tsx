import { resourceTypeUI } from "@samebase/alchemy-kit/ui";
import { KitIcon } from "@/components/KitIcon";

export function resourceTypePresentation(resourceType: string) {
  const { name, icon, color } = resourceTypeUI(resourceType);
  return { label: name, icon: <KitIcon icon={icon} color={color} className="size-4" /> };
}
