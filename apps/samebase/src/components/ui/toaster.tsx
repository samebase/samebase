import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { toastManager, useToast } from "@/components/ui/use-toast";

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
