import { Textarea } from "@/components/ui/textarea";

export function ConnectedMachineHeartbeatLogSection(props: { heartbeatLog: string }) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Live heartbeat log</h2>
        <p className="text-sm text-muted-foreground">
          New lines appear here while this page stays open and the local connector keeps pinging
          Samebase.
        </p>
      </div>
      <Textarea
        readOnly
        rows={2}
        value={props.heartbeatLog}
        className="min-h-0 resize-y font-mono text-xs"
      />
    </section>
  );
}
