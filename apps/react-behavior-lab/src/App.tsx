import { memo, useCallback, useMemo, useRef, useState } from "react";
import "./index.css";

type MachineStatus = "idle" | "busy" | "syncing";

type Machine = {
  id: string;
  minutesAgo: number;
  name: string;
  notes: string;
  pinned: boolean;
  status: MachineStatus;
  threadCount: number;
};

const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  busy: "Busy",
  idle: "Idle",
  syncing: "Syncing",
};

const MACHINES: Machine[] = Array.from({ length: 180 }, (_, index) => {
  const machineNumber = `${index + 1}`.padStart(3, "0");
  const status: MachineStatus =
    index % 7 === 0 ? "busy" : index % 5 === 0 ? "syncing" : "idle";

  return {
    id: `machine-${machineNumber}`,
    minutesAgo: 3 + ((index * 7) % 210),
    name: `Machine ${machineNumber}`,
    notes:
      index % 4 === 0
        ? "Pinned to the current worktree and waiting on a long-running thread."
        : "Watching branch previews and local thread hydration.",
    pinned: index % 9 === 0,
    status,
    threadCount: 2 + (index % 6),
  };
});

function formatMinutesAgo(minutesAgo: number): string {
  if (minutesAgo < 60) {
    return `${minutesAgo}m ago`;
  }

  const hoursAgo = Math.floor(minutesAgo / 60);
  return `${hoursAgo}h ago`;
}

type MachineRowProps = {
  machine: Machine;
  selected: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
};

function MachineRowBase({
  machine,
  selected,
  onSelect,
  onTogglePin,
}: MachineRowProps) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  return (
    <button
      type="button"
      className={`machine-row${selected ? " machine-row-selected" : ""}`}
      onClick={() => {
        onSelect(machine.id);
      }}
    >
      <div className="machine-row-copy">
        <div className="machine-row-title">
          <span>{machine.name}</span>
          <span className={`status-pill status-${machine.status}`}>
            {MACHINE_STATUS_LABELS[machine.status]}
          </span>
        </div>
        <div className="machine-row-meta">
          <span>{machine.threadCount} threads</span>
          <span>{formatMinutesAgo(machine.minutesAgo)}</span>
          <span>renders: {renderCountRef.current}</span>
        </div>
      </div>
      <span
        className={`pin-pill${machine.pinned ? " pin-pill-active" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onTogglePin(machine.id);
        }}
      >
        {machine.pinned ? "Pinned" : "Pin"}
      </span>
    </button>
  );
}

const MemoMachineRow = memo(
  MachineRowBase,
  (previousProps, nextProps) =>
    previousProps.machine === nextProps.machine &&
    previousProps.selected === nextProps.selected,
);

export default function App() {
  const [machines, setMachines] = useState(MACHINES);
  const [search, setSearch] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState(MACHINES[0].id);
  const [heartbeat, setHeartbeat] = useState(0);
  const [useMemoizedRows, setUseMemoizedRows] = useState(false);
  const filterRunsRef = useRef(0);

  const visibleMachines = useMemo(() => {
    filterRunsRef.current += 1;
    const normalizedSearch = search.trim().toLowerCase();
    if (normalizedSearch.length === 0) {
      return machines.slice(0, 12);
    }

    return machines
      .filter((machine) => {
        const haystack = `${machine.name} ${machine.notes}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .slice(0, 12);
  }, [machines, search]);

  const selectedMachine =
    machines.find((machine) => machine.id === selectedMachineId) ?? machines[0];
  const RowComponent = useMemoizedRows ? MemoMachineRow : MachineRowBase;

  const handleSelect = useCallback((machineId: string) => {
    setSelectedMachineId(machineId);
  }, []);

  const handleTogglePin = useCallback((machineId: string) => {
    setMachines((currentMachines) =>
      currentMachines.map((machine) =>
        machine.id === machineId
          ? { ...machine, pinned: !machine.pinned }
          : machine,
      ),
    );
  }, []);

  const handleSelectNext = useCallback(() => {
    const selectedIndex = visibleMachines.findIndex(
      (machine) => machine.id === selectedMachineId,
    );
    const nextIndex =
      selectedIndex >= 0 && selectedIndex + 1 < visibleMachines.length
        ? selectedIndex + 1
        : 0;

    setSelectedMachineId(visibleMachines[nextIndex]?.id ?? selectedMachineId);
  }, [selectedMachineId, visibleMachines]);

  return (
    <main className="lab-shell">
      <section className="lab-header">
        <div>
          <p className="eyebrow">React lab</p>
          <h1>Same component shape, different update model</h1>
          <p className="lede">
            This version is intentionally straightforward. The memo toggle shows
            how often React asks for extra ceremony once a list starts to grow.
          </p>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Heartbeat</span>
            <strong>{heartbeat}</strong>
            <span className="stat-note">
              Unrelated state that still re-renders the parent.
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Filter runs</span>
            <strong>{filterRunsRef.current}</strong>
            <span className="stat-note">
              Derived list work after search, pinning, and parent updates.
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Visible rows</span>
            <strong>{visibleMachines.length}</strong>
            <span className="stat-note">
              Watch the per-row render count while clicking around.
            </span>
          </div>
        </div>
      </section>

      <section className="lab-controls">
        <label className="search-field">
          <span>Search machines</span>
          <input
            value={search}
            placeholder="Search by name or notes"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </label>
        <div className="control-row">
          <button
            type="button"
            className="action-button"
            onClick={() => {
              setHeartbeat((current) => current + 1);
            }}
          >
            Tick heartbeat
          </button>
          <button
            type="button"
            className="action-button"
            onClick={() => {
              handleSelectNext();
            }}
          >
            Select next
          </button>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={useMemoizedRows}
              onChange={(event) => {
                setUseMemoizedRows(event.target.checked);
              }}
            />
            <span>Use React.memo rows</span>
          </label>
        </div>
      </section>

      <section className="lab-layout">
        <div className="machine-list">
          {visibleMachines.map((machine) => (
            <RowComponent
              key={machine.id}
              machine={machine}
              selected={machine.id === selectedMachineId}
              onSelect={handleSelect}
              onTogglePin={handleTogglePin}
            />
          ))}
        </div>

        <aside className="detail-card">
          <p className="eyebrow">Selected machine</p>
          <h2>{selectedMachine.name}</h2>
          <p className="detail-copy">{selectedMachine.notes}</p>
          <dl className="detail-grid">
            <div>
              <dt>Status</dt>
              <dd>{MACHINE_STATUS_LABELS[selectedMachine.status]}</dd>
            </div>
            <div>
              <dt>Pinned</dt>
              <dd>{selectedMachine.pinned ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Threads</dt>
              <dd>{selectedMachine.threadCount}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatMinutesAgo(selectedMachine.minutesAgo)}</dd>
            </div>
          </dl>
          <p className="hint">
            With memo off, any heartbeat tick or selection change bumps every
            visible row. With memo on, React gets closer to Solid, but you have
            to start managing that policy yourself. The memo toggle remounts
            rows in this demo, so compare behavior after switching it on.
          </p>
        </aside>
      </section>
    </main>
  );
}
