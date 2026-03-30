import { MachineConnectPageContent } from "@/components/MachineConnectPage";
import {
  buildNoterSyncConnectCommand,
  buildNoterSyncScriptUrl,
} from "@/lib/noterSync";

const FIXTURE_DEPLOY_ORIGIN = "https://noter.md";

export function MachineConnectVisualFixture() {
  const scriptUrl = buildNoterSyncScriptUrl(FIXTURE_DEPLOY_ORIGIN);

  return (
    <MachineConnectPageContent
      command={buildNoterSyncConnectCommand(scriptUrl)}
      openedByCli={true}
      scriptUrl={scriptUrl}
      testId="machine-connect-visual-fixture"
    />
  );
}
