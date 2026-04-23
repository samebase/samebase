import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

function HomeRouteRedirect() {
  const navigate = Route.useNavigate();
  const rootRouteSearch = useRootRouteSearch();

  useEffect(() => {
    void navigate({
      to: "/",
      search: rootRouteSearch,
      hash: true,
      replace: true,
      state: true,
    });
  }, [navigate, rootRouteSearch]);

  return null;
}

export const Route = createFileRoute("/home")({
  component: HomeRouteRedirect,
});
