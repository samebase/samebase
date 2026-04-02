export const MACHINE_THREAD_MODEL_OPTIONS = [
  {
    value: "gpt-5.4",
    label: "GPT-5.4",
  },
  {
    value: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
  },
  {
    value: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
  },
  {
    value: "gpt-5.3-codex-spark",
    label: "GPT-5.3 Codex Spark",
  },
] as const;

export type MachineThreadModel =
  (typeof MACHINE_THREAD_MODEL_OPTIONS)[number]["value"];

export const MACHINE_THREAD_REASONING_OPTIONS = [
  {
    value: "low",
    label: "Low",
  },
  {
    value: "medium",
    label: "Medium",
  },
  {
    value: "high",
    label: "High",
  },
  {
    value: "xhigh",
    label: "Extra High",
  },
] as const;

export type MachineThreadReasoningEffort =
  (typeof MACHINE_THREAD_REASONING_OPTIONS)[number]["value"];

export const DEFAULT_MACHINE_THREAD_MODEL: MachineThreadModel = "gpt-5.4";
export const DEFAULT_MACHINE_THREAD_REASONING_EFFORT: MachineThreadReasoningEffort =
  "xhigh";
const DEFAULT_MACHINE_THREAD_MODEL_LABEL = "GPT-5.4";
const DEFAULT_MACHINE_THREAD_REASONING_LABEL = "Extra High";

type MachineThreadStartRequestBody = {
  model: MachineThreadModel;
};

type MachineTurnStartRequestBody = {
  effort: MachineThreadReasoningEffort;
  model: MachineThreadModel;
  text: string;
  threadId?: string;
};

export type MachineTurnSubmissionPlan =
  | {
      kind: "existing-thread";
      threadId: string;
      turnStartBody: MachineTurnStartRequestBody;
    }
  | {
      kind: "new-thread";
      threadStartBody: MachineThreadStartRequestBody;
      turnStartBody: Omit<MachineTurnStartRequestBody, "threadId">;
    };

function isKnownMachineThreadModel(
  value: string | null | undefined,
): value is MachineThreadModel {
  return MACHINE_THREAD_MODEL_OPTIONS.some((option) => option.value === value);
}

function isKnownMachineThreadReasoningEffort(
  value: string | null | undefined,
): value is MachineThreadReasoningEffort {
  return MACHINE_THREAD_REASONING_OPTIONS.some(
    (option) => option.value === value,
  );
}

function normalizeQuerySelection(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function readMachineThreadModel(
  value: string | null | undefined,
): MachineThreadModel {
  const normalizedValue = normalizeQuerySelection(value);
  return isKnownMachineThreadModel(normalizedValue)
    ? normalizedValue
    : DEFAULT_MACHINE_THREAD_MODEL;
}

export function readMachineThreadReasoningEffort(
  value: string | null | undefined,
): MachineThreadReasoningEffort {
  const normalizedValue = normalizeQuerySelection(value);
  return isKnownMachineThreadReasoningEffort(normalizedValue)
    ? normalizedValue
    : DEFAULT_MACHINE_THREAD_REASONING_EFFORT;
}

export function readMachineThreadModelLabel(model: MachineThreadModel): string {
  return (
    MACHINE_THREAD_MODEL_OPTIONS.find((option) => option.value === model)
      ?.label ?? DEFAULT_MACHINE_THREAD_MODEL_LABEL
  );
}

export function readMachineThreadReasoningLabel(
  effort: MachineThreadReasoningEffort,
): string {
  return (
    MACHINE_THREAD_REASONING_OPTIONS.find((option) => option.value === effort)
      ?.label ?? DEFAULT_MACHINE_THREAD_REASONING_LABEL
  );
}

/**
 * Keep the submit path deterministic so the machines workspace can either
 * continue an explicit thread or materialize a new one before the first turn.
 */
export function planMachineTurnSubmission(args: {
  model: MachineThreadModel;
  prompt: string;
  reasoningEffort: MachineThreadReasoningEffort;
  selectedThreadId: string | null;
}): MachineTurnSubmissionPlan {
  const prompt = args.prompt.trim();
  if (prompt.length === 0) {
    throw new Error("Prompt is required.");
  }

  if (
    typeof args.selectedThreadId === "string" &&
    args.selectedThreadId.length
  ) {
    return {
      kind: "existing-thread",
      threadId: args.selectedThreadId,
      turnStartBody: {
        effort: args.reasoningEffort,
        model: args.model,
        text: prompt,
        threadId: args.selectedThreadId,
      },
    };
  }

  return {
    kind: "new-thread",
    threadStartBody: {
      model: args.model,
    },
    turnStartBody: {
      effort: args.reasoningEffort,
      model: args.model,
      text: prompt,
    },
  };
}
