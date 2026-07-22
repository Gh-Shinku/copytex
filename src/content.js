(function initCopyTeXContentScript() {
  const extractor = globalThis.CopyTeXExtractor;
  const selectionSerializer = globalThis.CopyTeXSelectionSerializer;
  const chatGptTools = globalThis.CopyTeXChatGPT;
  const settings = globalThis.CopyTeXSettings;
  const clipboard = globalThis.CopyTeXClipboard;
  const toastTools = globalThis.CopyTeXToast;
  const floatingButtonTools = globalThis.CopyTeXFloatingButton;

  if (
    !extractor ||
    !selectionSerializer ||
    !settings ||
    !clipboard ||
    !toastTools ||
    !floatingButtonTools ||
    globalThis.__copyTeXContentLoaded
  ) {
    return;
  }

  globalThis.__copyTeXContentLoaded = true;

  const COPY_MESSAGE = "COPY_LATEX_FROM_CONTEXT_MENU";
  const CHATGPT_RESPONSE_COPY_SCAN_DELAY = 250;

  let activeFormula = null;
  let contextFormula = null;
  let outputFormat = settings.DEFAULT_OUTPUT_FORMAT;
  let chatGptObserver = null;
  let chatGptScanTimer = null;

  const toast = toastTools.createToastController({
    document,
    window,
    toastId: "copytex-toast"
  });
  const floatingButton = floatingButtonTools.createFloatingButtonController({
    buttonId: "copytex-floating-button",
    document,
    window,
    onClick: () => copyFormula(activeFormula),
    onError: (message) => showToast(message, true),
    onHide: () => {
      activeFormula = null;
    }
  });

  document.addEventListener("pointerover", handlePointerOver, true);
  document.addEventListener("pointerout", handlePointerOut, true);
  document.addEventListener("contextmenu", handleContextMenu, true);
  document.addEventListener("copy", handleCopy, true);
  window.addEventListener("scroll", repositionFloatingButton, true);
  window.addEventListener("resize", repositionFloatingButton);
  markCurrentSite();
  loadOutputFormatPreference();
  listenForOutputFormatChanges();
  initChatGptResponseCopy();

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
    if (floatingButton.containsTarget(event.target)) {
      floatingButton.clearHideTimer();
      return;
    }

    const formula = extractor.findFormulaElement(event.target);
    if (!formula || !extractor.extractLatexFromElement(formula)) {
      return;
    }

    activeFormula = formula;
    floatingButton.show(formula);
  }

  function handlePointerOut(event) {
    if (!activeFormula) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (contains(activeFormula, nextTarget) || floatingButton.containsTarget(nextTarget)) {
      return;
    }

    floatingButton.scheduleHide(() => {
      activeFormula = null;
    });
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
      extractor,
      { outputFormat }
    );

    if (!result.handled || !result.text) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData.setData("text/plain", result.text);
    showToast(`Copied selection as ${settings.formatOutputFormatLabel(outputFormat)}`);
  }

  function repositionFloatingButton() {
    if (activeFormula) {
      floatingButton.position(activeFormula);
    }
  }

  async function copyFormula(formula) {
    const result = formula ? extractor.extractLatexFromElement(formula) : null;
    if (!result || !result.latex) {
      return { ok: false, error: "No formula source found" };
    }

    try {
      const text = selectionSerializer.formatFormula(result, { outputFormat });
      await clipboard.writeText(text);
      showToast(`Copied formula as ${settings.formatOutputFormatLabel(outputFormat)}`);
      return { ok: true, latex: result.latex, text };
    } catch (error) {
      const reason = error && error.message ? error.message : "Copy failed";
      return { ok: false, error: reason };
    }
  }

  async function copyChatGptResponse(_nativeButton, _copyTeXButton, turn) {
    if (!turn || !chatGptTools) {
      showToast("CopyTeX response copy is unavailable", true);
      return { ok: false, error: "CopyTeX response copy is unavailable" };
    }

    try {
      const result = chatGptTools.serializeChatGptTurnToMarkdown(
        turn,
        extractor,
        selectionSerializer,
        { outputFormat }
      );
      if (!result.ok || !result.text) {
        throw new Error(result.error || "No response content found");
      }

      await clipboard.writeText(result.text);
      showToast(`Copied response as ${settings.formatOutputFormatLabel(outputFormat)}`);
      return { ok: true, text: result.text };
    } catch (error) {
      const reason = error && error.message ? error.message : "Copy response failed";
      showToast(reason, true);
      return { ok: false, error: reason };
    }
  }

  function showToast(message, isError) {
    toast.show(message, isError);
  }

  function contains(parent, child) {
    return Boolean(parent && child && (parent === child || parent.contains(child)));
  }

  function loadOutputFormatPreference() {
    if (!chrome.storage || !chrome.storage.sync) {
      return;
    }

    chrome.storage.sync.get(
      { [settings.OUTPUT_FORMAT_STORAGE_KEY]: settings.DEFAULT_OUTPUT_FORMAT },
      (items) => {
        outputFormat = settings.normalizeOutputFormat(
          items[settings.OUTPUT_FORMAT_STORAGE_KEY]
        );
      }
    );
  }

  function listenForOutputFormatChanges() {
    if (!chrome.storage || !chrome.storage.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" || !changes[settings.OUTPUT_FORMAT_STORAGE_KEY]) {
        return;
      }

      outputFormat = settings.normalizeOutputFormat(
        changes[settings.OUTPUT_FORMAT_STORAGE_KEY].newValue
      );
    });
  }

  function markCurrentSite() {
    if (location.hostname === "chat.deepseek.com") {
      document.documentElement.dataset.copytexSite = "deepseek";
    }
  }

  function initChatGptResponseCopy() {
    if (!chatGptTools || !chatGptTools.isChatGptHost(location.hostname)) {
      return;
    }

    injectChatGptResponseCopyButtons();

    if (typeof MutationObserver !== "function") {
      return;
    }

    chatGptObserver = new MutationObserver(scheduleChatGptResponseCopyScan);
    chatGptObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function scheduleChatGptResponseCopyScan() {
    if (chatGptScanTimer) {
      return;
    }

    chatGptScanTimer = window.setTimeout(() => {
      chatGptScanTimer = null;
      injectChatGptResponseCopyButtons();
    }, CHATGPT_RESPONSE_COPY_SCAN_DELAY);
  }

  function injectChatGptResponseCopyButtons() {
    chatGptTools.injectResponseCopyButtons(document, copyChatGptResponse);
  }
})();
