import { MachineConnectPageContent } from "@/components/MachineConnectPage";
import {
  buildNoterSyncConnectCommand,
  buildNoterSyncScriptUrl,
} from "@/lib/noterSync";

const FIXTURE_DEPLOY_ORIGIN = "https://preview.noter.md";

export function MachineConnectVisualFixture() {
  const scriptUrl = buildNoterSyncScriptUrl(FIXTURE_DEPLOY_ORIGIN);

  return (
    <MachineConnectPageContent
      command={buildNoterSyncConnectCommand()}
      openedByCli={true}
      scriptUrl={scriptUrl}
      testId="machine-connect-visual-fixture"
    />
  );
}
