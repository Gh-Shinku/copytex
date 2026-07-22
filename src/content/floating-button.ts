import type { CopyResult } from "../shared/types";

export interface FloatingButtonController {
  clearHideTimer(): void;
  containsTarget(target: EventTarget | null): boolean;
  position(formula: Element | null): void;
  scheduleHide(callback?: () => void): void;
  show(formula: Element): void;
}

export interface FloatingButtonControllerOptions {
  document: Document;
  window: Window;
  buttonId?: string;
  onClick?: () => Promise<CopyResult> | CopyResult | null;
  onError?: (message: string) => void;
  onHide?: () => void;
}

export interface FloatingButtonModule {
  createFloatingButtonController(
    options: FloatingButtonControllerOptions
  ): FloatingButtonController;
}

const DEFAULT_BUTTON_ID = "copytex-floating-button";

export function createFloatingButtonController(
  options: FloatingButtonControllerOptions
): FloatingButtonController {
  const documentRef = options.document;
  const windowRef = options.window;
  const buttonId = options.buttonId || DEFAULT_BUTTON_ID;
  const onClick = options.onClick;
  const onError = options.onError;
  const onHide = options.onHide;
  let button: HTMLButtonElement | null = null;
  let hideTimer: number | null = null;

  function show(formula: Element): void {
    clearHideTimer();
    const buttonElement = ensure();
    buttonElement.hidden = false;
    buttonElement.dataset.copytexReady = "true";
    position(formula);
  }

  function hide(): void {
    if (button) {
      button.hidden = true;
    }
  }

  function scheduleHide(callback?: () => void): void {
    clearHideTimer();
    hideTimer = windowRef.setTimeout(() => {
      hide();
      const hideCallback = typeof callback === "function" ? callback : onHide;
      if (typeof hideCallback === "function") {
        hideCallback();
      }
    }, 160);
  }

  function clearHideTimer(): void {
    if (hideTimer) {
      windowRef.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function position(formula: Element | null): void {
    if (!button || button.hidden || !formula || !formula.getBoundingClientRect) {
      return;
    }

    const rect = formula.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const width = buttonRect.width || 88;
    const height = buttonRect.height || 30;
    const margin = 8;

    let top = rect.top - height - 6;
    if (top < margin) {
      top = rect.bottom + 6;
    }

    const left = Math.max(
      margin,
      Math.min(windowRef.innerWidth - width - margin, rect.right - width)
    );

    button.style.left = `${left}px`;
    button.style.top = `${Math.max(margin, top)}px`;
  }

  function containsTarget(target: EventTarget | null): boolean {
    return contains(button, target);
  }

  function ensure(): HTMLButtonElement {
    if (button) {
      return button;
    }

    button = documentRef.createElement("button");
    button.id = buttonId;
    button.type = "button";
    button.textContent = "Copy TeX";
    button.title = "Copy formula";
    button.setAttribute("aria-label", "Copy formula");
    button.hidden = true;

    button.addEventListener("pointerover", clearHideTimer);
    button.addEventListener("pointerout", () => scheduleHide());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      Promise.resolve(typeof onClick === "function" ? onClick() : null).then((result) => {
        if (result && !result.ok && typeof onError === "function") {
          onError(result.error || "Copy failed");
        }
      });
    });

    documentRef.documentElement.appendChild(button);
    return button;
  }

  return {
    clearHideTimer,
    containsTarget,
    position,
    scheduleHide,
    show
  };
}

function contains(parent: Node | null, child: EventTarget | null): boolean {
  return Boolean(parent && child instanceof Node && (parent === child || parent.contains(child)));
}

export const floatingButtonApi: FloatingButtonModule = {
  createFloatingButtonController
};

(
  globalThis as typeof globalThis & { CopyTeXFloatingButton?: FloatingButtonModule }
).CopyTeXFloatingButton = floatingButtonApi;
