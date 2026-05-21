import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nonNullable<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Chrome can surface translated touchmove events as non-cancelable once native
 * scrolling owns the gesture, so only cancel when the browser still allows it.
 */
export function preventDefaultIfCancelable(event: Pick<Event, "cancelable" | "preventDefault">) {
  if (!event.cancelable) {
    return;
  }

  event.preventDefault();
}
