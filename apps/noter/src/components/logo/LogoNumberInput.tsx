import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

const LOGO_NUMBER_INPUT_CLASS_NAMES = {
  preview:
    "h-9 w-full max-w-32 rounded-none border-border bg-background px-2 font-mono text-sm",
  seamLab:
    "h-9 w-full rounded-none border-black/15 bg-white px-2 font-mono text-sm text-black shadow-none",
} as const;

type LogoNumberInputVariant = keyof typeof LOGO_NUMBER_INPUT_CLASS_NAMES;

function parseLogoNumberInput(value: string): number | null {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  const parsedValue = Number(trimmedValue.replace(",", "."));
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function LogoNumberInput({
  ariaLabel,
  formatValue,
  inputMode = "decimal",
  max,
  min,
  normalizeValue,
  onValueChange,
  step,
  value,
  variant,
}: {
  ariaLabel: string;
  formatValue: (value: number) => string;
  inputMode?: "decimal" | "numeric";
  max?: number | string;
  min?: number | string;
  normalizeValue: (value: number) => number;
  onValueChange: (value: number) => void;
  step: number | string;
  value: number;
  variant: LogoNumberInputVariant;
}) {
  const normalizedValue = normalizeValue(value);
  const [inputValue, setInputValue] = useState(() =>
    formatValue(normalizedValue),
  );
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (isEditingRef.current) {
      return;
    }

    setInputValue(formatValue(normalizedValue));
  }, [formatValue, normalizedValue]);

  const commitInputValue = () => {
    isEditingRef.current = false;
    const parsedValue = parseLogoNumberInput(inputValue);
    const nextValue =
      parsedValue === null ? normalizedValue : normalizeValue(parsedValue);

    onValueChange(nextValue);
    setInputValue(formatValue(nextValue));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextInputValue = event.target.value;
    const parsedValue = parseLogoNumberInput(nextInputValue);

    isEditingRef.current = true;
    setInputValue(nextInputValue);

    if (parsedValue !== null) {
      onValueChange(normalizeValue(parsedValue));
    }
  };

  return (
    <Input
      aria-label={ariaLabel}
      type="number"
      inputMode={inputMode}
      min={min}
      max={max}
      step={step}
      value={inputValue}
      onFocus={() => {
        isEditingRef.current = true;
      }}
      onChange={handleChange}
      onBlur={commitInputValue}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      className={LOGO_NUMBER_INPUT_CLASS_NAMES[variant]}
    />
  );
}
