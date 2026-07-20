(function initCopyTeXContentScript() {
  const extractor = globalThis.CopyTeXExtractor;
  const selectionSerializer = globalThis.CopyTeXSelectionSerializer;

  if (!extractor || !selectionSerializer || globalThis.__copyTeXContentLoaded) {
    return;
  }

  globalThis.__copyTeXContentLoaded = true;

  const COPY_MESSAGE = "COPY_LATEX_FROM_CONTEXT_MENU";
  const BUTTON_ID = "copytex-floating-button";
  const TOAST_ID = "copytex-toast";

  let activeFormula = null;
  let contextFormula = null;
  let floatingButton = null;
  let toast = null;
  let hideTimer = null;
  let toastTimer = null;

  document.addEventListener("pointerover", handlePointerOver, true);
  document.addEventListener("pointerout", handlePointerOut, true);
  document.addEventListener("contextmenu", handleContextMenu, true);
  document.addEventListener("copy", handleCopy, true);
  window.addEventListener("scroll", repositionFloatingButton, true);
  window.addEventListener("resize", repositionFloatingButton);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== COPY_MESSAGE) {
      return false;
    }

    copyFormula(contextFormula)
      .then((response) => {
        if (!response.ok) {
          showToast(response.error || "Copy failed", true);
        }
        sendResponse(response);
      })
      .catch((error) => {
        const reason = error && error.message ? error.message : "Copy failed";
        showToast(reason, true);
        sendResponse({ ok: false, error: reason });
      });

    return true;
  });

  function handlePointerOver(event) {
    if (floatingButton && floatingButton.contains(event.target)) {
      clearHideTimer();
      return;
    }

    const formula = extractor.findFormulaElement(event.target);
    if (!formula || !extractor.extractLatexFromElement(formula)) {
      return;
    }

    activeFormula = formula;
    showFloatingButton(formula);
  }

  function handlePointerOut(event) {
    if (!activeFormula) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (
      contains(activeFormula, nextTarget) ||
      (floatingButton && contains(floatingButton, nextTarget))
    ) {
      return;
    }

    scheduleHideFloatingButton();
  }

  function handleContextMenu(event) {
    const formula = extractor.findFormulaElement(event.target);
    contextFormula = formula && extractor.extractLatexFromElement(formula) ? formula : null;
  }

  function handleCopy(event) {
    if (!event.clipboardData || !window.getSelection) {
      return;
    }

    const result = selectionSerializer.serializeSelectionToLatexText(
      window.getSelection(),
      extractor
    );

    if (!result.handled || !result.text) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData.setData("text/plain", result.text);
    showToast("Copied selection with LaTeX");
  }

  function showFloatingButton(formula) {
    clearHideTimer();
    ensureFloatingButton();
    floatingButton.hidden = false;
    floatingButton.dataset.copytexReady = "true";
    positionFloatingButton(formula);
  }

  function ensureFloatingButton() {
    if (floatingButton) {
      return floatingButton;
    }

    floatingButton = document.createElement("button");
    floatingButton.id = BUTTON_ID;
    floatingButton.type = "button";
    floatingButton.textContent = "Copy TeX";
    floatingButton.title = "Copy raw LaTeX source";
    floatingButton.setAttribute("aria-label", "Copy raw LaTeX source");
    floatingButton.hidden = true;

    floatingButton.addEventListener("pointerover", clearHideTimer);
    floatingButton.addEventListener("pointerout", scheduleHideFloatingButton);
    floatingButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      copyFormula(activeFormula).then((result) => {
        if (!result.ok) {
          showToast(result.error || "Copy failed", true);
        }
      });
    });

    document.documentElement.appendChild(floatingButton);
    return floatingButton;
  }

  function positionFloatingButton(formula) {
    if (!floatingButton || floatingButton.hidden || !formula || !formula.getBoundingClientRect) {
      return;
    }

    const rect = formula.getBoundingClientRect();
    const buttonRect = floatingButton.getBoundingClientRect();
    const width = buttonRect.width || 88;
    const height = buttonRect.height || 30;
    const margin = 8;

    let top = rect.top - height - 6;
    if (top < margin) {
      top = rect.bottom + 6;
    }

    const left = Math.max(
      margin,
      Math.min(window.innerWidth - width - margin, rect.right - width)
    );

    floatingButton.style.left = `${left}px`;
    floatingButton.style.top = `${Math.max(margin, top)}px`;
  }

  function repositionFloatingButton() {
    if (activeFormula) {
      positionFloatingButton(activeFormula);
    }
  }

  function scheduleHideFloatingButton() {
    clearHideTimer();
    hideTimer = window.setTimeout(() => {
      if (floatingButton) {
        floatingButton.hidden = true;
      }
      activeFormula = null;
    }, 160);
  }

  function clearHideTimer() {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  async function copyFormula(formula) {
    const result = formula ? extractor.extractLatexFromElement(formula) : null;
    if (!result || !result.latex) {
      return { ok: false, error: "No LaTeX source found" };
    }

    try {
      await writeClipboard(result.latex);
      showToast("Copied LaTeX source");
      return { ok: true, latex: result.latex };
    } catch (error) {
      const reason = error && error.message ? error.message : "Copy failed";
      return { ok: false, error: reason };
    }
  }

  async function writeClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (_error) {
        // Fall through to the legacy copy path for focused-document edge cases.
      }
    }

    copyViaTextArea(text);
  }

  function copyViaTextArea(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Clipboard write failed");
    }
  }

  function showToast(message, isError) {
    ensureToast();
    toast.textContent = message;
    toast.dataset.copytexError = isError ? "true" : "false";
    toast.hidden = false;

    if (toastTimer) {
      window.clearTimeout(toastTimer);
    }

    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 1700);
  }

  function ensureToast() {
    if (toast) {
      return toast;
    }

    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.setAttribute("role", "status");
    toast.hidden = true;
    document.documentElement.appendChild(toast);
    return toast;
  }

  function contains(parent, child) {
    return Boolean(parent && child && (parent === child || parent.contains(child)));
  }
})();
