import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
} from "solid-js";
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
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  selected: boolean;
};

function MachineRow(props: MachineRowProps) {
  const [selectedChecks, setSelectedChecks] = createSignal(0);

  createEffect(
    on(
      () => props.selected,
      () => {
        setSelectedChecks((count) => count + 1);
      },
    ),
  );

  return (
    <button
      type="button"
      class={`machine-row${props.selected ? " machine-row-selected" : ""}`}
      onClick={() => {
        props.onSelect(props.machine.id);
      }}
    >
      <div class="machine-row-copy">
        <div class="machine-row-title">
          <span>{props.machine.name}</span>
          <span class={`status-pill status-${props.machine.status}`}>
            {MACHINE_STATUS_LABELS[props.machine.status]}
          </span>
        </div>
        <div class="machine-row-meta">
          <span>{props.machine.threadCount} threads</span>
          <span>{formatMinutesAgo(props.machine.minutesAgo)}</span>
          <span>selected checks: {selectedChecks()}</span>
        </div>
      </div>
      <span
        class={`pin-pill${props.machine.pinned ? " pin-pill-active" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          props.onTogglePin(props.machine.id);
        }}
      >
        {props.machine.pinned ? "Pinned" : "Pin"}
      </span>
    </button>
  );
}

export default function App() {
  const [machines, setMachines] = createSignal(MACHINES);
  const [search, setSearch] = createSignal("");
  const [selectedMachineId, setSelectedMachineId] = createSignal(
    MACHINES[0].id,
  );
  const [heartbeat, setHeartbeat] = createSignal(0);
  const [filterRuns, setFilterRuns] = createSignal(0);

  const visibleMachines = createMemo(() => {
    setFilterRuns((count) => count + 1);
    const normalizedSearch = search().trim().toLowerCase();
    if (normalizedSearch.length === 0) {
      return machines().slice(0, 12);
    }

    return machines()
      .filter((machine) => {
        const haystack = `${machine.name} ${machine.notes}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .slice(0, 12);
  });

  const selectedMachine = createMemo(
    () =>
      machines().find((machine) => machine.id === selectedMachineId()) ??
      machines()[0],
  );

  const handleTogglePin = (machineId: string) => {
    setMachines((currentMachines) =>
      currentMachines.map((machine) =>
        machine.id === machineId
          ? { ...machine, pinned: !machine.pinned }
          : machine,
      ),
    );
  };

  const handleSelectNext = () => {
    const currentVisibleMachines = visibleMachines();
    const selectedIndex = currentVisibleMachines.findIndex(
      (machine) => machine.id === selectedMachineId(),
    );
    const nextIndex =
      selectedIndex >= 0 && selectedIndex + 1 < currentVisibleMachines.length
        ? selectedIndex + 1
        : 0;

    setSelectedMachineId(
      currentVisibleMachines[nextIndex]?.id ?? selectedMachineId(),
    );
  };

  return (
    <main class="lab-shell">
      <section class="lab-header">
        <div>
          <p class="eyebrow">Solid lab</p>
          <h1>Signals change what feels normal to write</h1>
          <p class="lede">
            The surface is the same, but the component body stays quiet while
            only the selected rows react. The code stays close to the naive
            version instead of reaching for memoization policy.
          </p>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Heartbeat</span>
            <strong>{heartbeat()}</strong>
            <span class="stat-note">
              Unrelated state leaves the row-local counters alone.
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Filter runs</span>
            <strong>{filterRuns()}</strong>
            <span class="stat-note">
              Derived list work still happens when its dependencies change.
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Visible rows</span>
            <strong>{visibleMachines().length}</strong>
            <span class="stat-note">
              Selection still reevaluates row props across the list.
            </span>
          </div>
        </div>
      </section>

      <section class="lab-controls">
        <label class="search-field">
          <span>Search machines</span>
          <input
            value={search()}
            placeholder="Search by name or notes"
            onInput={(event) => {
              setSearch(event.currentTarget.value);
            }}
          />
        </label>
        <div class="control-row">
          <button
            type="button"
            class="action-button"
            onClick={() => {
              setHeartbeat((current) => current + 1);
            }}
          >
            Tick heartbeat
          </button>
          <button
            type="button"
            class="action-button"
            onClick={() => {
              handleSelectNext();
            }}
          >
            Select next
          </button>
          <span class="solid-note">
            No memo toggle here: this is the default behavior.
          </span>
        </div>
      </section>

      <section class="lab-layout">
        <div class="machine-list">
          <For each={visibleMachines()}>
            {(machine) => (
              <MachineRow
                machine={machine}
                selected={machine.id === selectedMachineId()}
                onSelect={setSelectedMachineId}
                onTogglePin={handleTogglePin}
              />
            )}
          </For>
        </div>

        <Show when={selectedMachine()}>
          {(machine) => (
            <aside class="detail-card">
              <p class="eyebrow">Selected machine</p>
              <h2>{machine().name}</h2>
              <p class="detail-copy">{machine().notes}</p>
              <dl class="detail-grid">
                <div>
                  <dt>Status</dt>
                  <dd>{MACHINE_STATUS_LABELS[machine().status]}</dd>
                </div>
                <div>
                  <dt>Pinned</dt>
                  <dd>{machine().pinned ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Threads</dt>
                  <dd>{machine().threadCount}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatMinutesAgo(machine().minutesAgo)}</dd>
                </div>
              </dl>
              <p class="hint">
                In practice the win is not magic zero-work updates everywhere.
                The real win is fewer defensive abstractions around unrelated
                parent state, while the UI still reads like JSX.
              </p>
            </aside>
          )}
        </Show>
      </section>
    </main>
  );
}
