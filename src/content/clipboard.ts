export interface ClipboardApi {
  writeText(text: string): Promise<void>;
}

export async function writeText(text: string): Promise<void> {
  const navigatorRef = globalThis.navigator;
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

function copyViaTextArea(text: string): void {
  const documentRef = globalThis.document;
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

export const clipboardApi: ClipboardApi = {
  writeText
};

(globalThis as typeof globalThis & { CopyTeXClipboard?: ClipboardApi }).CopyTeXClipboard =
  clipboardApi;
