// An explicit-state model of the locking rule of the GitHub state store. A breadth-first search
// over every interleaving of a few processes checks the properties below. Pure model: no Effect,
// no HTTP, no store code.
//
// P1: each write to a stage happens while the writer holds its lease.
// P2: at a deploy's first write, the stage is at the version of its `list` and of each earlier read.
// P3: a process that only makes point reads of a stage takes no lease of it and never fails on one.
// P4: two point reads of one stage by one process give one version.
// P5: a deploy of A that reads B, and a deploy of B: no one fails.
// P6: of two deploys of one stage, the second fails at its `list` and writes nothing, or it lists
//     after the first one's last write.
// P7: after a crash of the lease holder, the lease expires and another deploy can finish.
import { describe, expect, it } from "vitest";

/**
 * `lease-on-read` is BucketState's rule: each operation takes the lease. `lease-on-list` is the
 * store's rule: a point read takes no lease and keeps its first answer, and `list` takes the lease
 * and fails when a stage that the process read changed since. `no-compare` is that rule without
 * the comparison. `lease-on-first-write` takes the lease only at the first write.
 */
type Rule = "lease-on-read" | "lease-on-list" | "no-compare" | "lease-on-first-write";
type Kind = "get" | "list" | "write";
type Step =
  | { readonly kind: Kind; readonly stage: number }
  | { readonly kind: "plan" }
  | { readonly kind: "end" };
type Property = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7";

interface Scenario {
  readonly name: string;
  readonly procs: readonly { readonly name: string; readonly program: readonly Step[] }[];
  readonly crashes: boolean;
  /** The properties checked on top of P1 to P4. */
  readonly extra: readonly Property[];
}

interface Proc {
  readonly pc: number;
  readonly status: "running" | "done" | "failed" | "crashed";
  /** The version of each stage at this process's `list` of it. */
  readonly listed: readonly (number | null)[];
  /** The answer of this process's first `get` of each stage. */
  readonly read: readonly (number | null)[];
  /** The version of each stage after this process's last write to it. */
  readonly wroteTo: readonly (number | null)[];
}

interface State {
  readonly versions: readonly number[];
  /** The holder of each stage's lease, as a process index. */
  readonly leases: readonly (number | null)[];
  readonly procs: readonly Proc[];
}

interface Transition {
  readonly label: string;
  readonly next: State;
  /** The properties that this step breaks. */
  readonly broken: readonly Property[];
}

const A = 0;
const B = 1;
const stageName = (stage: number) => (stage === A ? "A" : "B");
const when = (condition: boolean, property: Property): Property[] => (condition ? [property] : []);

/**
 * A deploy of `stage`, which first reads a record of `alsoReads`. With `eager`, its stack program
 * also reads a record of its own stage before its `list`.
 */
const deploy = (name: string, stage: number, alsoReads?: number, eager = false) => ({
  name,
  program: [
    ...(alsoReads === undefined ? [] : [{ kind: "get", stage: alsoReads } as const]),
    ...(eager ? [{ kind: "get", stage } as const] : []),
    { kind: "list", stage } as const,
    { kind: "plan" } as const,
    { kind: "write", stage } as const,
    { kind: "write", stage } as const,
    { kind: "end" } as const,
  ],
});

/** A point reader, such as `alchemy logs`. */
const reader = (name: string, stage: number) => {
  const get = { kind: "get", stage } as const;
  return { name, program: [get, get, { kind: "end" } as const] };
};

/** Which steps take the lease of their stage. A `write` always does. */
const takesLease = (rule: Rule, kind: Kind) =>
  kind === "write" ||
  (kind === "list" && rule !== "lease-on-first-write") ||
  (kind === "get" && rule === "lease-on-read");

/** The stages that a program only reads with `get`. */
const pointReadOnly = (program: readonly Step[]) => {
  const locks = program.flatMap((s) => (s.kind === "list" || s.kind === "write" ? [s.stage] : []));
  return program.flatMap((s) => (s.kind === "get" && !locks.includes(s.stage) ? [s.stage] : []));
};

const replaceAt = <T>(items: readonly T[], index: number, value: T): T[] =>
  items.map((item, i) => (i === index ? value : item));

const release = (leases: readonly (number | null)[], pid: number) =>
  leases.map((holder) => (holder === pid ? null : holder));

const holderName = (scenario: Scenario, s: State, holder: number) =>
  `${scenario.procs[holder]?.name ?? "?"}${s.procs[holder]?.status === "crashed" ? " (crashed)" : ""}`;

type Access = { readonly kind: Kind; readonly stage: number };

/**
 * The failure of a step: another process holds the lease that it needs, or, under `lease-on-list`, its
 * `list` finds the stage changed after this process read it.
 */
const refusal = (rule: Rule, scenario: Scenario, s: State, pid: number, proc: Proc, op: Access) => {
  const { name, program } = scenario.procs[pid] ?? { name: "?", program: [] };
  const x = op.stage;
  const holder = s.leases[x] ?? null;
  const kept = proc.read[x] ?? null;
  const current = s.versions[x] ?? 0;
  const failed = (why: string, broken: Property[]): Transition => ({
    label: `${name}: fails at ${op.kind} ${stageName(x)}, ${why}`,
    next: {
      ...s,
      leases: release(s.leases, pid),
      procs: replaceAt(s.procs, pid, { ...proc, status: "failed" }),
    },
    broken,
  });
  if (takesLease(rule, op.kind) && holder !== null && holder !== pid) {
    // P6: a second deploy of a stage fails at its `list`.
    return failed(`lease held by ${holderName(scenario, s, holder)}`, [
      ...when(pointReadOnly(program).includes(x), "P3"),
      ...when(op.kind !== "list", "P6"),
    ]);
  }
  if (op.kind === "list" && rule === "lease-on-list" && kept !== null && kept !== current) {
    return failed(`changed after its read (v${kept}, now v${current})`, []);
  }
  return undefined;
};

/** A `get`, `list`, or `write` that is not refused. */
const access = (rule: Rule, s: State, pid: number, proc: Proc, op: Access) => {
  const x = op.stage;
  const current = s.versions[x] ?? 0;
  const takes = takesLease(rule, op.kind) && s.leases[x] !== pid;
  const leases = takes ? replaceAt(s.leases, x, pid) : s.leases;
  const kept = proc.read[x] ?? null;
  const result = (value: number, changes: Partial<Proc>, broken: Property[] = []) => ({
    label: `${op.kind} ${stageName(x)} = v${value}${takes ? " (takes its lease)" : ""}`,
    next: {
      versions: op.kind === "write" ? replaceAt(s.versions, x, value) : s.versions,
      leases,
      procs: replaceAt(s.procs, pid, { ...proc, pc: proc.pc + 1, ...changes }),
    },
    broken,
  });
  if (op.kind === "list") return result(current, { listed: replaceAt(proc.listed, x, current) });
  if (op.kind === "get") {
    // A point read is a `get` without the lease. `lease-on-list` gives its first answer again.
    const point = leases[x] !== pid;
    const keeps = rule === "lease-on-list" || rule === "no-compare";
    const value = point && keeps && kept !== null ? kept : current;
    const read = kept === null ? replaceAt(proc.read, x, value) : proc.read;
    return result(value, { read }, when(point && kept !== null && value !== kept, "P4"));
  }
  const value = current + 1;
  // P2: at the first write, the stage is still at the version of the `list` and of each read.
  const stale = (proc.listed[x] ?? null) !== current || (kept !== null && kept !== current);
  return result(value, { wroteTo: replaceAt(proc.wroteTo, x, value) }, [
    ...when(leases[x] !== pid, "P1"),
    ...when((proc.wroteTo[x] ?? null) === null && stale, "P2"),
  ]);
};

/** The next step of process `pid`. */
const stepOf = (rule: Rule, scenario: Scenario, s: State, pid: number, proc: Proc, step: Step) => {
  const name = scenario.procs[pid]?.name ?? "?";
  const moved = (status: Proc["status"], leases = s.leases): State => ({
    ...s,
    leases,
    procs: replaceAt(s.procs, pid, { ...proc, pc: proc.pc + 1, status }),
  });
  if (step.kind === "plan") return { label: `${name}: plans`, next: moved("running"), broken: [] };
  if (step.kind === "end") {
    const done = moved("done", release(s.leases, pid));
    return { label: `${name}: ends, releases its leases`, next: done, broken: [] };
  }
  const refused = refusal(rule, scenario, s, pid, proc, step);
  if (refused !== undefined) return refused;
  const done = access(rule, s, pid, proc, step);
  return { ...done, label: `${name}: ${done.label}` };
};

/** Every step that some process can take from `s`, then every lease that can expire. */
const successors = (rule: Rule, scenario: Scenario, s: State): Transition[] => [
  ...s.procs.flatMap((proc, pid) => {
    const step = scenario.procs[pid]?.program[proc.pc];
    if (proc.status !== "running" || step === undefined) return [];
    const crash = {
      label: `${scenario.procs[pid]?.name ?? "?"}: crashes`,
      next: { ...s, procs: replaceAt(s.procs, pid, { ...proc, status: "crashed" as const }) },
      broken: [],
    };
    return [...(scenario.crashes ? [crash] : []), stepOf(rule, scenario, s, pid, proc, step)];
  }),
  ...s.leases.flatMap((holder, x) => {
    if (holder === null || s.procs[holder]?.status !== "crashed") return [];
    const next = { ...s, leases: replaceAt(s.leases, x, null) };
    return [{ label: `lease of ${stageName(x)} expires`, next, broken: [] }];
  }),
];

/** The properties that state `s` breaks: P3 a point reader holds a lease, P5 and P6 a failure. */
const brokenIn = (scenario: Scenario, s: State): Property[] => {
  const failed = s.procs.filter((p) => p.status === "failed");
  const readerLocks = s.procs.some((_, pid) =>
    pointReadOnly(scenario.procs[pid]?.program ?? []).some((x) => s.leases[x] === pid),
  );
  const failedAfterWrite = failed.some((p) => p.wroteTo.some((v) => v !== null));
  return [
    ...when(readerLocks, "P3"),
    ...when(failed.length > 0, "P5"),
    ...when(failedAfterWrite, "P6"),
  ];
};

/**
 * At the end: P5 every process finished; P6 when two deploys wrote a stage, one of them listed it
 * only after the other's last write.
 */
const brokenAtEnd = (s: State): Property[] => {
  const overlap = s.procs.some((p, i) =>
    s.procs.some((q, j) =>
      [A, B].some((x) => {
        const pTo = p.wroteTo[x] ?? null;
        const qTo = q.wroteTo[x] ?? null;
        return (
          i < j &&
          pTo !== null &&
          qTo !== null &&
          (q.listed[x] ?? -1) < pTo &&
          (p.listed[x] ?? -1) < qTo
        );
      }),
    ),
  );
  return [
    ...when(
      s.procs.some((p) => p.status !== "done"),
      "P5",
    ),
    ...when(overlap, "P6"),
  ];
};

const initial = (scenario: Scenario): State => ({
  versions: [0, 0],
  leases: [null, null],
  procs: scenario.procs.map(() => ({
    pc: 0,
    status: "running",
    listed: [null, null],
    read: [null, null],
    wroteTo: [null, null],
  })),
});

/** Breadth-first search from `start`. The first violation of each property has a shortest path. */
const explore = (rule: Rule, scenario: Scenario, start = initial(scenario)) => {
  const checked = (p: Property) =>
    p === "P1" || p === "P2" || p === "P3" || p === "P4" || scenario.extra.includes(p);
  const parents = new Map<string, { readonly from: string; readonly label: string } | null>();
  const pathTo = (key: string): string[] => {
    const labels: string[] = [];
    for (let link = parents.get(key); link; link = parents.get(link.from))
      labels.unshift(link.label);
    return labels;
  };
  const found = new Map<Property, readonly string[]>();
  const record = (properties: readonly Property[], path: () => string[]) => {
    for (const p of properties) if (checked(p) && !found.has(p)) found.set(p, path());
  };
  const queue = [{ state: start, key: JSON.stringify(start) }];
  parents.set(queue[0]?.key ?? "", null);
  record(brokenIn(scenario, start), () => []);
  for (const { state, key } of queue) {
    const next = successors(rule, scenario, state);
    if (next.length === 0) record(brokenAtEnd(state), () => pathTo(key));
    for (const transition of next) {
      record(transition.broken, () => [...pathTo(key), transition.label]);
      const nextKey = JSON.stringify(transition.next);
      if (parents.has(nextKey)) continue;
      parents.set(nextKey, { from: key, label: transition.label });
      record(brokenIn(scenario, transition.next), () => pathTo(nextKey));
      queue.push({ state: transition.next, key: nextKey });
    }
  }
  return { states: parents.size, found, reached: queue.map((entry) => entry.state) };
};

/**
 * P7: from each reachable state where a crashed process holds the lease of a stage and a deploy
 * of that stage has not started, some path lets that deploy finish.
 */
const checkCrashRecovery = (rule: Rule, scenario: Scenario, reached: readonly State[]) => {
  let candidates = 0;
  for (const s of reached) {
    for (const [x, holder] of s.leases.entries()) {
      if (holder === null || s.procs[holder]?.status !== "crashed") continue;
      for (const [pid, p] of s.procs.entries()) {
        const program = scenario.procs[pid]?.program ?? [];
        const writes = program.some((step) => step.kind === "write" && step.stage === x);
        if (pid === holder || !writes || p.pc !== 0 || p.status !== "running") continue;
        candidates++;
        const after = explore(rule, scenario, s).reached;
        if (!after.some((t) => t.procs[pid]?.status === "done")) return { candidates, stuck: s };
      }
    }
  }
  return { candidates, stuck: null };
};

const scenario = (
  name: string,
  procs: Scenario["procs"],
  crashes: boolean,
  ...extra: Property[]
): Scenario => ({ name, procs, crashes, extra });

const prodAndPreview = [deploy("prod", B), deploy("preview", A, B)];
const twoDeploys = [deploy("first", A), deploy("second", A)];
const SCENARIOS = [
  // A preview deploy of stage A reads a record of stage B (prod) while prod deploys.
  scenario("cross-stage", prodAndPreview, false, "P5"),
  scenario("same-stage", twoDeploys, false, "P6"),
  // The stack program of the second deploy reads a record of its own stage before its `list`.
  scenario(
    "same-stage, eager read",
    [deploy("first", A), deploy("second", A, undefined, true)],
    false,
    "P6",
  ),
  scenario("cross-stage, reader, crashes", [...prodAndPreview, reader("logs", B)], true),
  scenario("same-stage, crashes", twoDeploys, true, "P7"),
];

const show = (title: string, path: readonly string[] | undefined) =>
  console.log(
    `${title}\n${(path ?? ["(none)"]).map((label, i) => `  ${i + 1}. ${label}`).join("\n")}`,
  );

/** The shortest counterexample of `property` over all scenarios, with its scenario. */
const shortest = (rule: Rule, property: Property) => {
  let best: { scenario: string; path: readonly string[] } | undefined;
  for (const scenario of SCENARIOS) {
    const path = explore(rule, scenario).found.get(property);
    if (path && (best === undefined || path.length < best.path.length))
      best = { scenario: scenario.name, path };
  }
  return best;
};

describe("the locking rule of the GitHub state store", () => {
  it("lease-on-read (BucketState): P5 and P3 are violated", () => {
    const p5 = shortest("lease-on-read", "P5");
    show(`lease-on-read, P5 violated (${p5?.scenario}):`, p5?.path);
    expect(p5).toEqual({
      scenario: "cross-stage",
      path: ["prod: list B = v0 (takes its lease)", "preview: fails at get B, lease held by prod"],
    });
    const p3 = shortest("lease-on-read", "P3");
    show(`lease-on-read, P3 violated (${p3?.scenario}):`, p3?.path);
    expect(p3?.path.length).toBeGreaterThan(0);
  });

  it("lease-on-list (the rule): every property holds in every scenario", () => {
    for (const scenario of SCENARIOS) {
      const result = explore("lease-on-list", scenario);
      for (const [property, path] of result.found)
        show(`VIOLATED ${property} (${scenario.name}):`, path);
      const recovery = scenario.extra.includes("P7")
        ? checkCrashRecovery("lease-on-list", scenario, result.reached)
        : undefined;
      console.log(
        `lease-on-list, ${scenario.name}: ${result.states} states, checked P1-P4 ${scenario.extra.join(" ")}${recovery ? `, P7 from ${recovery.candidates} crash states` : ""}`,
      );
      expect([...result.found.keys()]).toEqual([]);
      if (recovery) {
        expect(recovery.candidates).toBeGreaterThan(0);
        expect(recovery.stuck).toBeNull();
      }
    }
  });

  it("no-compare (the rule without the comparison at list): P2 is violated", () => {
    const p2 = shortest("no-compare", "P2");
    show(`no-compare, P2 violated (${p2?.scenario}):`, p2?.path);
    expect(p2?.scenario).toBe("same-stage, eager read");
    // The eager read gets a version from the middle of the first deploy.
    expect(p2?.path.slice(3, 7)).toEqual([
      "second: get A = v1",
      "first: write A = v2",
      "first: ends, releases its leases",
      "second: list A = v2 (takes its lease)",
    ]);
  });

  it("lease-on-first-write: P2 is violated, and P4 for a reader", () => {
    const p2 = shortest("lease-on-first-write", "P2");
    show(`lease-on-first-write, P2 violated (${p2?.scenario}):`, p2?.path);
    expect(p2?.path.length).toBeGreaterThan(0);
    // It keeps no first answer, so P4 can fail: the check of P4 is not empty.
    const p4 = shortest("lease-on-first-write", "P4");
    show(`lease-on-first-write, P4 violated (${p4?.scenario}):`, p4?.path);
    expect(p4?.path.length).toBeGreaterThan(0);
  });
});
