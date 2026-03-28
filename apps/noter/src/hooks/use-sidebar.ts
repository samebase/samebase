import { useSidebar as useBaseSidebar } from "@/components/ui/sidebar";
import { useForcedMobileSidebar } from "@/hooks/use-forced-mobile-sidebar";

/**
 * Lets visual fixtures force the mobile sidebar behavior without mutating the
 * generated shadcn provider. Production routes continue to follow the real
 * responsive breakpoint.
 */
export function useSidebar() {
  const sidebar = useBaseSidebar();
  const forceMobile = useForcedMobileSidebar();

  if (!forceMobile) {
    return sidebar;
  }

  return {
    ...sidebar,
    isMobile: true,
    toggleSidebar: () => {
      sidebar.setOpenMobile(!sidebar.openMobile);
    },
  };
}
