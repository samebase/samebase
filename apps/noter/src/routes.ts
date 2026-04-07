import { type RouteConfig, route } from "@react-router/dev/routes";

export default [
  // `*` matches every path segment, and `?` keeps `/` in the same catchall
  // while the old component-route tree still lives inside `App.tsx`.
  route("*?", "catchall.tsx"),
] satisfies RouteConfig;
