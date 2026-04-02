import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import {
  MACHINE_THREAD_MODEL_OPTIONS,
  MACHINE_THREAD_REASONING_OPTIONS,
  readMachineThreadModelLabel,
  readMachineThreadReasoningLabel,
  type MachineThreadModel,
  type MachineThreadReasoningEffort,
} from "@/lib/machinesThreadComposer";
import { cn } from "@/lib/utils";

type MachinesThreadComposerControlsProps = {
  disabled?: boolean;
  model: MachineThreadModel;
  reasoningEffort: MachineThreadReasoningEffort;
  onModelChange: (value: MachineThreadModel) => void;
  onReasoningEffortChange: (value: MachineThreadReasoningEffort) => void;
};

function ComposerControl<Value extends string>(props: {
  currentLabel: string;
  disabled?: boolean;
  menuLabel: string;
  onValueChange: (value: Value) => void;
  options: ReadonlyArray<{
    label: string;
    value: Value;
  }>;
  value: Value;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={props.disabled}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[14px] font-normal text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <span>{props.currentLabel}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[12rem]">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {props.menuLabel}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={props.value}
          onValueChange={(value) => {
            const nextValue = props.options.find(
              (option) => option.value === value,
            )?.value;
            if (!nextValue) {
              return;
            }

            props.onValueChange(nextValue);
          }}
        >
          {props.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MachinesThreadComposerControls(
  props: MachinesThreadComposerControlsProps,
) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      <ComposerControl
        currentLabel={readMachineThreadModelLabel(props.model)}
        disabled={props.disabled}
        menuLabel="Model"
        onValueChange={props.onModelChange}
        options={MACHINE_THREAD_MODEL_OPTIONS}
        value={props.model}
      />
      <ComposerControl
        currentLabel={readMachineThreadReasoningLabel(props.reasoningEffort)}
        disabled={props.disabled}
        menuLabel="Reasoning"
        onValueChange={props.onReasoningEffortChange}
        options={MACHINE_THREAD_REASONING_OPTIONS}
        value={props.reasoningEffort}
      />
    </div>
  );
}
