(function registerCopyTeXToast(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CopyTeXToast = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createToastModule() {
  const DEFAULT_TOAST_ID = "copytex-toast";

  function createToastController(options) {
    const documentRef = options && options.document;
    const windowRef = options && options.window;
    const toastId = (options && options.toastId) || DEFAULT_TOAST_ID;
    let toast = null;
    let toastTimer = null;

    function show(message, isError) {
      ensure();
      toast.textContent = message;
      toast.dataset.copytexError = isError ? "true" : "false";
      toast.hidden = false;

      if (toastTimer) {
        windowRef.clearTimeout(toastTimer);
      }

      toastTimer = windowRef.setTimeout(() => {
        toast.hidden = true;
      }, 1700);
    }

    function ensure() {
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

  return {
    createToastController
  };
});
