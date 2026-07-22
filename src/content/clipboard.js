(function registerCopyTeXClipboard(root, factory) {
  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CopyTeXClipboard = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createClipboard(root) {
  async function writeText(text) {
    const navigatorRef = root.navigator;
    if (
      navigatorRef &&
      navigatorRef.clipboard &&
      typeof navigatorRef.clipboard.writeText === "function"
    ) {
      try {
        await navigatorRef.clipboard.writeText(text);
        return;
      } catch (_error) {
        // Fall through to the legacy copy path for focused-document edge cases.
      }
    }

    copyViaTextArea(text);
  }

  function copyViaTextArea(text) {
    const documentRef = root.document;
    if (!documentRef || !documentRef.body || typeof documentRef.createElement !== "function") {
      throw new Error("Clipboard write failed");
    }

    const textarea = documentRef.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    documentRef.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = documentRef.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Clipboard write failed");
    }
  }

  return {
    writeText
  };
});
