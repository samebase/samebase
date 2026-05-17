import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "#src/components/ui/toast.tsx";
import { toastManager, useToast } from "#src/components/ui/use-toast.ts";

function ToastList() {
  const { toasts } = useToast();

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <div className="grid gap-1">
        <ToastTitle />
        <ToastDescription />
      </div>
      {toastItem.data?.action}
      <ToastClose />
    </Toast>
  ));
}

export function Toaster() {
  return (
    <ToastProvider limit={1} toastManager={toastManager}>
      <ToastList />
      <ToastViewport />
    </ToastProvider>
  );
}
