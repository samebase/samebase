import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

type ToastData = {
  action?: ToastActionElement;
};

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

const toastManager = ToastPrimitive.createToastManager<ToastData>();

function toToastOptions({
  action,
  description,
  title,
  variant,
  ...props
}: ToastProps) {
  return {
    ...props,
    data: action === undefined ? undefined : { action },
    description,
    title,
    type: variant,
  };
}

function toast(props: ToastProps) {
  const id = props.id ?? genId();

  toastManager.add({
    id,
    ...toToastOptions(props),
  });

  return {
    dismiss: () => toastManager.close(id),
    id,
    update: (nextProps: ToastProps) => {
      toastManager.update(id, toToastOptions(nextProps));
    },
  };
}

function useToast() {
  const manager = ToastPrimitive.useToastManager<ToastData>();

  return {
    dismiss: (toastId?: string) => toastManager.close(toastId),
    toast,
    toasts: manager.toasts,
  };
}

export { toastManager, useToast, toast };
