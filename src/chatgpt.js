(function registerCopyTeXChatGPT(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CopyTeXChatGPT = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createChatGPTTools() {
  const ASSISTANT_TURN_SELECTOR =
    'section[data-testid^="conversation-turn-"][data-turn="assistant"]';
  const ASSISTANT_MARKDOWN_SELECTOR =
    '[data-message-author-role="assistant"] .markdown';
  const NATIVE_COPY_SELECTOR = 'button[data-testid="copy-turn-action-button"]';
  const COPYTEX_RESPONSE_COPY_ATTRIBUTE = "data-copytex-response-copy";
  const COPYTEX_NATIVE_INJECTED_ATTRIBUTE = "data-copytex-response-copy-injected";
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;

  function isChatGptHost(hostname) {
    return hostname === "chatgpt.com" || hostname === "chat.openai.com";
  }

  function injectResponseCopyButtons(root, onClick) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return 0;
    }

    let count = 0;
    const nativeButtons = Array.from(root.querySelectorAll(NATIVE_COPY_SELECTOR));
    for (const nativeButton of nativeButtons) {
      if (!isInjectableNativeCopyButton(nativeButton)) {
        continue;
      }

      const copyTeXButton = createResponseCopyButton(nativeButton, onClick);
      nativeButton.setAttribute(COPYTEX_NATIVE_INJECTED_ATTRIBUTE, "true");
      nativeButton.insertAdjacentElement("afterend", copyTeXButton);
      count += 1;
    }

    return count;
  }

  function isInjectableNativeCopyButton(button) {
    if (!button || typeof button.getAttribute !== "function") {
      return false;
    }

    if (button.getAttribute(COPYTEX_RESPONSE_COPY_ATTRIBUTE) === "true") {
      return false;
    }

    if (button.getAttribute(COPYTEX_NATIVE_INJECTED_ATTRIBUTE) === "true") {
      return false;
    }

    return Boolean(closest(button, ASSISTANT_TURN_SELECTOR));
  }

  function createResponseCopyButton(nativeButton, onClick) {
    const button = nativeButton.cloneNode(false);
    button.removeAttribute("data-testid");
    button.removeAttribute("data-state");
    button.setAttribute(COPYTEX_RESPONSE_COPY_ATTRIBUTE, "true");
    button.setAttribute("aria-label", "Copy message with CopyTeX");
    button.setAttribute("title", "Copy message with CopyTeX");
    button.innerHTML =
      '<span class="copytex-response-copy-label flex items-center justify-center touch:w-10 h-8 w-8">TeX</span>';

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (typeof onClick === "function") {
        onClick(nativeButton, button, closest(nativeButton, ASSISTANT_TURN_SELECTOR));
      }
    });

    return button;
  }

  function serializeChatGptTurnToMarkdown(turn, extractor, formatter, options) {
    const messageRoot = querySelector(turn, ASSISTANT_MARKDOWN_SELECTOR);
    if (!messageRoot) {
      return { ok: false, text: "", error: "No response content found" };
    }

    const context = {
      extractor,
      formatter,
      options: options || {},
      emittedFormulas: typeof WeakSet === "function" ? new WeakSet() : null
    };
    const text = cleanMarkdown(serializeBlockChildren(messageRoot, context));

    return text
      ? { ok: true, text }
      : { ok: false, text: "", error: "No response content found" };
  }

  function serializeBlockChildren(node, context) {
    const blocks = [];

    for (const child of childNodes(node)) {
      const text = serializeBlockNode(child, context);
      if (text) {
        blocks.push(text);
      }
    }

    return blocks.join("\n\n");
  }

  function serializeBlockNode(node, context) {
    if (!node) {
      return "";
    }

    if (node.nodeType === TEXT_NODE) {
      return cleanInlineText(node.nodeValue || node.textContent || "");
    }

    if (!isElementLike(node)) {
      return "";
    }

    const formula = findFormulaElement(node, context);
    if (formula === node) {
      return formatFormulaElement(formula, context);
    }

    const tag = tagName(node);
    if (tag === "p") {
      return cleanParagraphText(serializeInlineChildren(node, context));
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const text = cleanInlineText(serializeInlineChildren(node, context));
      return text ? `${"#".repeat(level)} ${text}` : "";
    }

    if (tag === "ul" || tag === "ol") {
      return serializeList(node, tag === "ol", context, 0);
    }

    if (tag === "li") {
      return cleanInlineText(serializeInlineChildren(node, context));
    }

    if (tag === "blockquote") {
      const quote = serializeBlockChildren(node, context);
      return quote
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    }

    if (tag === "pre") {
      return serializeCodeBlock(node);
    }

    if (tag === "hr") {
      return "---";
    }

    if (tag === "table") {
      return serializeTable(node, context);
    }

    if (tag === "br") {
      return "\n";
    }

    return hasBlockChildren(node)
      ? serializeBlockChildren(node, context)
      : cleanInlineText(serializeInlineChildren(node, context));
  }

  function serializeInlineChildren(node, context) {
    return childNodes(node)
      .map((child) => serializeInlineNode(child, context))
      .join("");
  }

  function serializeInlineNode(node, context) {
    if (!node) {
      return "";
    }

    if (node.nodeType === TEXT_NODE) {
      return node.nodeValue || node.textContent || "";
    }

    if (!isElementLike(node)) {
      return "";
    }

    const formula = findFormulaElement(node, context);
    if (formula) {
      return formatFormulaElement(formula, context);
    }

    const tag = tagName(node);
    if (tag === "br") {
      return "\n";
    }

    if (tag === "strong" || tag === "b") {
      const text = serializeInlineChildren(node, context);
      return text ? `**${text}**` : "";
    }

    if (tag === "em" || tag === "i") {
      const text = serializeInlineChildren(node, context);
      return text ? `*${text}*` : "";
    }

    if (tag === "code") {
      return formatInlineCode(node.textContent || "");
    }

    if (tag === "a") {
      const text = serializeInlineChildren(node, context) || getAttribute(node, "href");
      const href = getAttribute(node, "href");
      return href ? `[${text}](${href})` : text;
    }

    if (tag === "img") {
      const alt = getAttribute(node, "alt");
      const src = getAttribute(node, "src");
      return src ? `![${alt}](${src})` : alt;
    }

    return serializeInlineChildren(node, context);
  }

  function serializeList(listNode, ordered, context, depth) {
    const lines = [];
    const items = children(listNode).filter((child) => tagName(child) === "li");

    items.forEach((item, index) => {
      const prefix = `${"  ".repeat(depth)}${ordered ? `${index + 1}. ` : "- "}`;
      const parts = [];
      const nested = [];

      for (const child of childNodes(item)) {
        const tag = tagName(child);
        if (tag === "ul" || tag === "ol") {
          nested.push(serializeList(child, tag === "ol", context, depth + 1));
        } else if (isBlockElement(child) && tag !== "p") {
          parts.push(serializeBlockNode(child, context));
        } else {
          parts.push(serializeInlineNode(child, context));
        }
      }

      const content = cleanInlineText(parts.join(""));
      lines.push(`${prefix}${content}`);

      for (const nestedList of nested) {
        if (nestedList) {
          lines.push(nestedList);
        }
      }
    });

    return lines.join("\n");
  }

  function serializeCodeBlock(pre) {
    const code = querySelector(pre, "code") || pre;
    const language = languageFromCodeElement(code);
    return `\`\`\`${language}\n${String(code.textContent || "").trimEnd()}\n\`\`\``;
  }

  function languageFromCodeElement(code) {
    const className = String(code.className || "");
    const match = className.match(/(?:^|\s)language-([^\s]+)/);
    return match ? match[1] : "";
  }

  function serializeTable(table, context) {
    const rows = querySelectorAll(table, "tr").map((row) =>
      children(row).filter((cell) => tagName(cell) === "th" || tagName(cell) === "td")
    );
    const nonEmptyRows = rows.filter((row) => row.length);
    if (!nonEmptyRows.length) {
      return "";
    }

    const header = nonEmptyRows[0].map((cell) => cleanTableCell(serializeInlineChildren(cell, context)));
    const body = nonEmptyRows.slice(1).map((row) =>
      row.map((cell) => cleanTableCell(serializeInlineChildren(cell, context)))
    );
    const separator = header.map(() => "---");
    const lines = [
      markdownTableRow(header),
      markdownTableRow(separator),
      ...body.map(markdownTableRow)
    ];

    return lines.join("\n");
  }

  function markdownTableRow(cells) {
    return `| ${cells.join(" | ")} |`;
  }

  function cleanTableCell(text) {
    return cleanInlineText(text).replace(/\|/g, "\\|");
  }

  function findFormulaElement(node, context) {
    if (!context.extractor || typeof context.extractor.findFormulaElement !== "function") {
      return null;
    }

    const formula = context.extractor.findFormulaElement(node);
    if (!formula) {
      return null;
    }

    if (context.emittedFormulas && context.emittedFormulas.has(formula)) {
      return null;
    }

    return formula;
  }

  function formatFormulaElement(formula, context) {
    const extracted = context.extractor.extractLatexFromElement(formula);
    if (!extracted || !extracted.latex) {
      return "";
    }

    if (context.emittedFormulas) {
      context.emittedFormulas.add(formula);
    }

    return context.formatter.formatFormula(extracted, context.options);
  }

  function formatInlineCode(text) {
    const value = String(text || "");
    const backtickRuns = value.match(/`+/g) || [];
    const fenceLength = Math.max(1, ...backtickRuns.map((run) => run.length + 1));
    const fence = "`".repeat(fenceLength);
    return `${fence}${value}${fence}`;
  }

  function hasBlockChildren(node) {
    return children(node).some(isBlockElement);
  }

  function isBlockElement(node) {
    return /^(blockquote|div|h[1-6]|hr|ol|p|pre|table|ul)$/.test(tagName(node));
  }

  function cleanMarkdown(text) {
    return String(text || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanInlineText(text) {
    return String(text || "")
      .replace(/[ \t\n]+/g, " ")
      .trim();
  }

  function cleanParagraphText(text) {
    const value = String(text || "");
    return value.includes("\n") ? cleanMarkdown(value) : cleanInlineText(value);
  }

  function closest(element, selector) {
    if (!element) {
      return null;
    }

    if (typeof element.closest === "function") {
      return element.closest(selector);
    }

    let cursor = element;
    while (cursor) {
      if (matches(cursor, selector)) {
        return cursor;
      }
      cursor = cursor.parentElement || cursor.parentNode || null;
    }

    return null;
  }

  function matches(element, selector) {
    if (!element) {
      return false;
    }

    if (typeof element.matches === "function") {
      return element.matches(selector);
    }

    if (selector === ASSISTANT_TURN_SELECTOR) {
      return (
        String(element.tagName || "").toLowerCase() === "section" &&
        String(getAttribute(element, "data-testid")).startsWith("conversation-turn-") &&
        getAttribute(element, "data-turn") === "assistant"
      );
    }

    return false;
  }

  function getAttribute(element, name) {
    return element && typeof element.getAttribute === "function"
      ? element.getAttribute(name) || ""
      : "";
  }

  function querySelector(root, selector) {
    if (root && typeof root.querySelector === "function") {
      return root.querySelector(selector);
    }

    return querySelectorAll(root, selector)[0] || null;
  }

  function querySelectorAll(root, selector) {
    if (root && typeof root.querySelectorAll === "function") {
      return Array.from(root.querySelectorAll(selector));
    }

    const matches = [];
    walk(root, (node) => {
      if (matchesSelector(node, selector)) {
        matches.push(node);
      }
    });
    return matches;
  }

  function matchesSelector(node, selector) {
    if (!isElementLike(node)) {
      return false;
    }

    if (typeof node.matches === "function") {
      return node.matches(selector);
    }

    if (selector === ASSISTANT_MARKDOWN_SELECTOR) {
      return hasClass(node, "markdown") && Boolean(closest(node, '[data-message-author-role="assistant"]'));
    }

    if (selector === "code" || selector === "tr") {
      return tagName(node) === selector;
    }

    if (selector === '[data-message-author-role="assistant"]') {
      return getAttribute(node, "data-message-author-role") === "assistant";
    }

    return false;
  }

  function walk(root, visit) {
    if (!root) {
      return;
    }

    for (const child of childNodes(root)) {
      visit(child);
      walk(child, visit);
    }
  }

  function childNodes(node) {
    return Array.from((node && (node.childNodes || node.children)) || []);
  }

  function children(node) {
    return Array.from((node && node.children) || []).filter(isElementLike);
  }

  function tagName(node) {
    return String((node && node.tagName) || "").toLowerCase();
  }

  function hasClass(node, className) {
    if (node && node.classList && typeof node.classList.contains === "function") {
      return node.classList.contains(className);
    }

    return String((node && node.className) || "")
      .split(/\s+/)
      .includes(className);
  }

  function isElementLike(value) {
    return Boolean(value && (value.nodeType === ELEMENT_NODE || typeof value.tagName === "string"));
  }

  return {
    ASSISTANT_MARKDOWN_SELECTOR,
    ASSISTANT_TURN_SELECTOR,
    COPYTEX_RESPONSE_COPY_ATTRIBUTE,
    NATIVE_COPY_SELECTOR,
    injectResponseCopyButtons,
    isChatGptHost,
    serializeChatGptTurnToMarkdown
  };
});
