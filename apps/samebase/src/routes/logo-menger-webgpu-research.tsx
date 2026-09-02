import { LogoMengerWebGpuLabPage } from "@/components/logo/LogoMengerWebGpuLabPage";
import { buildLogoLabPageHead } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/logo/webgpu/menger";

export const Route = createFileRoute("/logo/webgpu/menger")({
  head: () => buildLogoLabPageHead(pathname, "TypeGPU Menger Lab"),
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[pathname],
  component: LogoMengerWebGpuLabPage,
});
