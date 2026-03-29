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
      command={buildNoterSyncConnectCommand(FIXTURE_DEPLOY_ORIGIN)}
      deployOrigin={FIXTURE_DEPLOY_ORIGIN}
      installationId="preview-nicuchiciuc-noter-md-1a2b3c4d5e6f"
      openedByCli={true}
      scriptUrl={scriptUrl}
      sourceUrl={scriptUrl}
      testId="machine-connect-visual-fixture"
    />
  );
}
