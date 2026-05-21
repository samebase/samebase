import { fail } from "./scriptRuntime.ts";

export function isHelpArg(arg: string): boolean {
  return arg === "--help" || arg === "-h";
}

export function readOptionValue(args: string[], index: number): string | null {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    return null;
  }

  return value;
}

export function requireOptionValue(
  args: string[],
  index: number,
  arg: string,
  helpText: string,
): string {
  const value = readOptionValue(args, index);
  if (value === null) {
    fail(`Missing value for ${arg}\n\n${helpText}`);
  }

  return value;
}

export function parsePositiveIntegerOption(
  rawValue: string,
  arg: string,
  helpText: string,
): number {
  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    fail(`Invalid value for ${arg}\n\n${helpText}`);
  }

  return parsedValue;
}

export function failUnexpectedArgument(arg: string, helpText: string): never {
  fail(`Unknown argument: ${arg}\n\n${helpText}`);
}

export function failMissingRequiredOptions(message: string, helpText: string): never {
  fail(`${message}\n\n${helpText}`);
}
