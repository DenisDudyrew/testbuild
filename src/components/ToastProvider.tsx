"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

interface AlertState {
  message: string;
  resolve: (value: void) => void;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
  showConfirm: (message: string) => Promise<boolean>;
  showAlert: (message: string) => Promise<void>;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirm({ message, resolve });
    });
  }, []);

  const showAlert = useCallback((message: string): Promise<void> => {
    return new Promise((resolve) => {
      setAlert({ message, resolve });
    });
  }, []);

  const closeConfirm = () => {
    confirm?.resolve(false);
    setConfirm(null);
  };

  const closeAlert = () => {
    alert?.resolve();
    setAlert(null);
  };

  return (
    <ToastContext.Provider value={{ showToast, showConfirm, showAlert }}>
      {children}

      {/* Toast-уведомления */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all duration-300 glass-strong ${
              toast.type === "error"
                ? "bg-red-600 text-white"
                : toast.type === "success"
                ? "bg-green-600 text-white"
                : "bg-zinc-900 text-white"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Confirm-диалог */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeConfirm}>
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl p-6 shadow-lg animate-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-zinc-900 dark:text-zinc-100">{confirm.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={closeConfirm}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  confirm.resolve(true);
                  setConfirm(null);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert-диалог */}
      {alert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeAlert}>
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl p-6 shadow-lg animate-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-zinc-900 dark:text-zinc-100">{alert.message}</p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={closeAlert}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
