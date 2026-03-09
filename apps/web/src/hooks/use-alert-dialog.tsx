"use client";

import React, { createContext, useContext, useState, useRef, useCallback } from "react";
import { TriangleAlert, Info, CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export type AlertType = "info" | "warning" | "error" | "success";

type AlertOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  type?: AlertType;
};

type AlertContextType = {
  alert: (description: string, type?: AlertType) => void;
  confirm: (options: AlertOptions) => Promise<boolean>;
};

const ALERT_TYPE_CONFIG: Record<AlertType, { icon: React.ReactNode; title: string }> = {
  success: {
    icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    title: "成功",
  },
  info: {
    icon: <Info className="h-5 w-5 text-blue-600" />,
    title: "提示",
  },
  warning: {
    icon: <TriangleAlert className="h-5 w-5 text-yellow-600" />,
    title: "警告",
  },
  error: {
    icon: <TriangleAlert className="h-5 w-5 text-destructive" />,
    title: "错误",
  },
};

const AlertContext = createContext<AlertContextType | null>(null);

export function AlertDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<AlertOptions & { showCancel?: boolean }>({});
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const handleAction = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const alert = useCallback((description: string, type: AlertType = "info") => {
    setOptions({ description, type, showCancel: false });
    setOpen(true);
  }, []);

  const confirm = useCallback((opts: AlertOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions({ ...opts, showCancel: true });
      setOpen(true);
    });
  }, []);

  const type = options.type || "info";
  const config = ALERT_TYPE_CONFIG[type];

  return (
    <AlertContext.Provider value={{ alert, confirm }}>
      {children}

      <AlertDialog
        open={open}
        onOpenChange={(v) => {
          if (!v) handleAction(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {config.icon}
              {options.title || config.title}
            </AlertDialogTitle>
            {options.description && (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            {options.showCancel && (
              <AlertDialogCancel onClick={() => handleAction(false)}>
                {options.cancelText || "取消"}
              </AlertDialogCancel>
            )}
            <AlertDialogAction onClick={() => handleAction(true)}>
              {options.confirmText || "确定"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AlertContext.Provider>
  );
}

export function useAlertDialog() {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error("useAlertDialog must be used inside AlertDialogProvider");
  }
  return ctx;
}
