import { useEffect, useRef, useState } from "react";

export type ConnectedMachineHeartbeatMachine = {
  displayName: string;
  hostname: string;
  lastSeenAt: number;
  machineId: string;
  status: "offline" | "online";
};

const MAX_HEARTBEAT_LOG_LINES = 40;

export function formatConnectedMachineHeartbeatTimestamp(
  value: number,
): string {
  return new Date(value).toLocaleTimeString();
}

function buildHeartbeatLogLine(args: {
  machine: ConnectedMachineHeartbeatMachine;
  kind: "discovered" | "heartbeat" | "status";
}) {
  const timestamp = formatConnectedMachineHeartbeatTimestamp(
    args.machine.lastSeenAt,
  );
  const summary = `${args.machine.displayName} (${args.machine.hostname})`;

  switch (args.kind) {
    case "discovered":
      return `[${timestamp}] observing ${summary}; last ping seen, currently ${args.machine.status}.`;
    case "status":
      return `[${timestamp}] ${summary} is now ${args.machine.status}.`;
    case "heartbeat":
      return `[${timestamp}] heartbeat from ${summary}.`;
  }
}

export function useConnectedMachineHeartbeatLog(
  machines: ConnectedMachineHeartbeatMachine[],
): string {
  const [lines, setLines] = useState<string[]>([]);
  const previousMachinesRef = useRef(
    new Map<
      string,
      {
        lastSeenAt: number;
        status: ConnectedMachineHeartbeatMachine["status"];
      }
    >(),
  );

  useEffect(() => {
    const previousMachines = previousMachinesRef.current;
    const nextMachines = new Map<
      string,
      {
        lastSeenAt: number;
        status: ConnectedMachineHeartbeatMachine["status"];
      }
    >();
    const nextLines: string[] = [];

    for (const machine of machines) {
      nextMachines.set(machine.machineId, {
        lastSeenAt: machine.lastSeenAt,
        status: machine.status,
      });

      const previousMachine = previousMachines.get(machine.machineId);
      if (!previousMachine) {
        nextLines.push(buildHeartbeatLogLine({ machine, kind: "discovered" }));
        continue;
      }

      if (machine.lastSeenAt > previousMachine.lastSeenAt) {
        nextLines.push(buildHeartbeatLogLine({ machine, kind: "heartbeat" }));
      }

      if (machine.status !== previousMachine.status) {
        nextLines.push(buildHeartbeatLogLine({ machine, kind: "status" }));
      }
    }

    previousMachinesRef.current = nextMachines;
    if (nextLines.length === 0) {
      return;
    }

    setLines((current) =>
      [...current, ...nextLines].slice(-MAX_HEARTBEAT_LOG_LINES),
    );
  }, [machines]);

  return lines.join("\n");
}
