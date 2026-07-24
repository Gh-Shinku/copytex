import type { FormatOptions, FormulaExtractionResult } from "./shared/types";
import { serializeMarkdownChildren } from "./markdown";

export const ASSISTANT_TURN_SELECTOR =
  'section[data-testid^="conversation-turn-"][data-turn="assistant"]';
export const ASSISTANT_MARKDOWN_SELECTOR =
  '[data-message-author-role="assistant"] .markdown';
export const NATIVE_COPY_SELECTOR = 'button[data-testid="copy-turn-action-button"]';
export const COPYTEX_RESPONSE_COPY_ATTRIBUTE = "data-copytex-response-copy";
const COPYTEX_NATIVE_INJECTED_ATTRIBUTE = "data-copytex-response-copy-injected";
const ELEMENT_NODE = 1;

interface ExtractorApi {
  findFormulaElement(node: unknown): Element | null;
  extractLatexFromElement(node: unknown): FormulaExtractionResult | null;
}

interface FormulaFormatter {
  formatFormula(extracted: FormulaExtractionResult, options?: FormatOptions): string;
}

export interface ChatGptApi {
  ASSISTANT_MARKDOWN_SELECTOR: string;
  ASSISTANT_TURN_SELECTOR: string;
  COPYTEX_RESPONSE_COPY_ATTRIBUTE: string;
  NATIVE_COPY_SELECTOR: string;
  injectResponseCopyButtons(
    root: ParentNode,
    onClick?: (nativeButton: Element, copyTeXButton: Element, turn: Element | null) => void
  ): number;
  isChatGptHost(hostname: string): boolean;
  serializeChatGptTurnToMarkdown(
    turn: ParentNode,
    extractor: ExtractorApi,
    formatter: FormulaFormatter,
    options?: FormatOptions
  ): { ok: boolean; text: string; error?: string };
}

export function isChatGptHost(hostname: string): boolean {
  return hostname === "chatgpt.com" || hostname === "chat.openai.com";
}

export function injectResponseCopyButtons(
  root: ParentNode,
  onClick?: (nativeButton: Element, copyTeXButton: Element, turn: Element | null) => void
): number {
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

function isInjectableNativeCopyButton(button: Element | null): boolean {
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

function createResponseCopyButton(
  nativeButton: Element,
  onClick?: (nativeButton: Element, copyTeXButton: Element, turn: Element | null) => void
): Element {
  const button = nativeButton.cloneNode(false) as Element;
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

export function serializeChatGptTurnToMarkdown(
  turn: ParentNode,
  extractor: ExtractorApi,
  formatter: FormulaFormatter,
  options?: FormatOptions
): { ok: boolean; text: string; error?: string } {
  const messageRoot = querySelector(turn, ASSISTANT_MARKDOWN_SELECTOR);
  if (!messageRoot) {
    return { ok: false, text: "", error: "No response content found" };
  }

  const text = serializeMarkdownChildren(messageRoot, extractor, formatter, options);

  return text
    ? { ok: true, text }
    : { ok: false, text: "", error: "No response content found" };
}

function closest(element: unknown, selector: string): Element | null {
  if (!element) {
    return null;
  }

  if (isElementLike(element) && typeof element.closest === "function") {
    return element.closest(selector);
  }

  let cursor = isNodeLike(element) ? element : null;
  while (cursor) {
    if (matches(cursor, selector)) {
      return cursor as Element;
    }
    cursor = cursor.parentElement || cursor.parentNode || null;
  }

  return null;
}

function matches(element: unknown, selector: string): boolean {
  if (!element) {
    return false;
  }

  if (isElementLike(element) && typeof element.matches === "function") {
    return element.matches(selector);
  }

  if (selector === ASSISTANT_TURN_SELECTOR) {
    return (
      tagName(element) === "section" &&
      String(getAttribute(element, "data-testid")).startsWith("conversation-turn-") &&
      getAttribute(element, "data-turn") === "assistant"
    );
  }

  return false;
}

function getAttribute(element: unknown, name: string): string {
  if (element && typeof (element as Element).getAttribute === "function") {
    return (element as Element).getAttribute(name) || "";
  }
  return "";
}

function querySelector(root: unknown, selector: string): Element | null {
  if (root && typeof (root as ParentNode).querySelector === "function") {
    return (root as ParentNode).querySelector(selector);
  }

  return querySelectorAll(root, selector)[0] || null;
}

function querySelectorAll(root: unknown, selector: string): Element[] {
  if (root && typeof (root as ParentNode).querySelectorAll === "function") {
    return Array.from((root as ParentNode).querySelectorAll(selector));
  }

  const selectorMatches: Element[] = [];
  walk(root, (node) => {
    if (matchesSelector(node, selector)) {
      selectorMatches.push(node);
    }
  });
  return selectorMatches;
}

function matchesSelector(node: Node, selector: string): node is Element {
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

function walk(root: unknown, visit: (node: Node) => void): void {
  if (!root) {
    return;
  }

  for (const child of childNodes(root)) {
    visit(child);
    walk(child, visit);
  }
}

function childNodes(node: unknown): Node[] {
  return Array.from(((node as { childNodes?: Node[]; children?: Node[] } | null) &&
    ((node as { childNodes?: Node[]; children?: Node[] }).childNodes ||
      (node as { childNodes?: Node[]; children?: Node[] }).children)) || []);
}

function tagName(node: unknown): string {
  return String((node as { tagName?: unknown } | null)?.tagName || "").toLowerCase();
}

function hasClass(node: unknown, className: string): boolean {
  if (
    node &&
    (node as Element).classList &&
    typeof (node as Element).classList.contains === "function"
  ) {
    return (node as Element).classList.contains(className);
  }

  return String((node as { className?: unknown } | null)?.className || "")
    .split(/\s+/)
    .includes(className);
}

function isElementLike(value: unknown): value is Element {
  return Boolean(
    value &&
      ((value as Node).nodeType === ELEMENT_NODE ||
        typeof (value as Element).tagName === "string")
  );
}

function isNodeLike(value: unknown): value is Node {
  return Boolean(value && typeof (value as Node).nodeType === "number");
}

export const chatGptApi: ChatGptApi = {
  ASSISTANT_MARKDOWN_SELECTOR,
  ASSISTANT_TURN_SELECTOR,
  COPYTEX_RESPONSE_COPY_ATTRIBUTE,
  NATIVE_COPY_SELECTOR,
  injectResponseCopyButtons,
  isChatGptHost,
  serializeChatGptTurnToMarkdown
};

(globalThis as typeof globalThis & { CopyTeXChatGPT?: ChatGptApi }).CopyTeXChatGPT =
  chatGptApi;
