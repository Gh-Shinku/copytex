(function registerCopyTeXFloatingButton(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CopyTeXFloatingButton = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFloatingButtonModule() {
  const DEFAULT_BUTTON_ID = "copytex-floating-button";

  function createFloatingButtonController(options) {
    const documentRef = options && options.document;
    const windowRef = options && options.window;
    const buttonId = (options && options.buttonId) || DEFAULT_BUTTON_ID;
    const onClick = options && options.onClick;
    const onError = options && options.onError;
    const onHide = options && options.onHide;
    let button = null;
    let hideTimer = null;

    function show(formula) {
      clearHideTimer();
      ensure();
      button.hidden = false;
      button.dataset.copytexReady = "true";
      position(formula);
    }

    function hide() {
      if (button) {
        button.hidden = true;
      }
    }

    function scheduleHide(callback) {
      clearHideTimer();
      hideTimer = windowRef.setTimeout(() => {
        hide();
        const hideCallback = typeof callback === "function" ? callback : onHide;
        if (typeof hideCallback === "function") {
          hideCallback();
        }
      }, 160);
    }

    function clearHideTimer() {
      if (hideTimer) {
        windowRef.clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    function position(formula) {
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

    function containsTarget(target) {
      return contains(button, target);
    }

    function ensure() {
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

  function contains(parent, child) {
    return Boolean(parent && child && (parent === child || parent.contains(child)));
  }

  return {
    createFloatingButtonController
  };
});
