import { CodexThreadBrowserView } from "@/components/CodexThreadBrowserView";
import { useLocalCodexThreadBrowser } from "@/hooks/useLocalCodexThreadBrowser";

export function CodexAppServerThreadBrowserResearchPage() {
  const threadBrowserViewProps = useLocalCodexThreadBrowser();

  return <CodexThreadBrowserView {...threadBrowserViewProps} />;
}
