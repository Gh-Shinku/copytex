export interface ToastController {
  show(message: string, isError?: boolean): void;
}

export interface ToastControllerOptions {
  document: Document;
  window: Window;
  toastId?: string;
}

export interface ToastModule {
  createToastController(options: ToastControllerOptions): ToastController;
}

const DEFAULT_TOAST_ID = "copytex-toast";

export function createToastController(options: ToastControllerOptions): ToastController {
  const documentRef = options.document;
  const windowRef = options.window;
  const toastId = options.toastId || DEFAULT_TOAST_ID;
  let toast: HTMLDivElement | null = null;
  let toastTimer: number | null = null;

  function show(message: string, isError?: boolean): void {
    const toastElement = ensure();
    toastElement.textContent = message;
    toastElement.dataset.copytexError = isError ? "true" : "false";
    toastElement.hidden = false;

    if (toastTimer) {
      windowRef.clearTimeout(toastTimer);
    }

    toastTimer = windowRef.setTimeout(() => {
      toastElement.hidden = true;
    }, 1700);
  }

  function ensure(): HTMLDivElement {
    if (toast) {
      return toast;
    }

    toast = documentRef.createElement("div");
    toast.id = toastId;
    toast.setAttribute("role", "status");
    toast.hidden = true;
    documentRef.documentElement.appendChild(toast);
    return toast;
  }

  return {
    show
  };
}

export const toastApi: ToastModule = {
  createToastController
};

(globalThis as typeof globalThis & { CopyTeXToast?: ToastModule }).CopyTeXToast = toastApi;
