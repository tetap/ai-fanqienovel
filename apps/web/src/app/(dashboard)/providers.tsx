"use client";

import { AlertDialogProvider } from "@/hooks/use-alert-dialog";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AlertDialogProvider>{children}</AlertDialogProvider>;
}
