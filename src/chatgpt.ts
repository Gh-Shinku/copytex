import type { FormatOptions, FormulaExtractionResult } from "./shared/types";

export const ASSISTANT_TURN_SELECTOR =
  'section[data-testid^="conversation-turn-"][data-turn="assistant"]';
export const ASSISTANT_MARKDOWN_SELECTOR =
  '[data-message-author-role="assistant"] .markdown';
export const NATIVE_COPY_SELECTOR = 'button[data-testid="copy-turn-action-button"]';
export const COPYTEX_RESPONSE_COPY_ATTRIBUTE = "data-copytex-response-copy";
const COPYTEX_NATIVE_INJECTED_ATTRIBUTE = "data-copytex-response-copy-injected";
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

interface ExtractorApi {
  findFormulaElement(node: unknown): Element | null;
  extractLatexFromElement(node: unknown): FormulaExtractionResult | null;
}

interface FormulaFormatter {
  formatFormula(extracted: FormulaExtractionResult, options?: FormatOptions): string;
}

interface MarkdownContext {
  extractor: ExtractorApi;
  formatter: FormulaFormatter;
  options: FormatOptions;
  emittedFormulas: WeakSet<Element> | null;
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

  const context: MarkdownContext = {
    extractor,
    formatter,
    options: options || {},
    emittedFormulas: typeof WeakSet === "function" ? new WeakSet<Element>() : null
  };
  const text = cleanMarkdown(serializeBlockChildren(messageRoot, context));

  return text
    ? { ok: true, text }
    : { ok: false, text: "", error: "No response content found" };
}

function serializeBlockChildren(node: Node, context: MarkdownContext): string {
  const blocks: string[] = [];

  for (const child of childNodes(node)) {
    const text = serializeBlockNode(child, context);
    if (text) {
      blocks.push(text);
    }
  }

  return blocks.join("\n\n");
}

function serializeBlockNode(node: Node | null, context: MarkdownContext): string {
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

function serializeInlineChildren(node: Node, context: MarkdownContext): string {
  return childNodes(node)
    .map((child) => serializeInlineNode(child, context))
    .join("");
}

function serializeInlineNode(node: Node | null, context: MarkdownContext): string {
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

function serializeList(
  listNode: Element,
  ordered: boolean,
  context: MarkdownContext,
  depth: number
): string {
  const lines: string[] = [];
  const items = children(listNode).filter((child) => tagName(child) === "li");

  items.forEach((item, index) => {
    const prefix = `${"  ".repeat(depth)}${ordered ? `${index + 1}. ` : "- "}`;
    const parts: string[] = [];
    const nested: string[] = [];

    for (const child of childNodes(item)) {
      const tag = tagName(child);
      if (tag === "ul" || tag === "ol") {
        nested.push(serializeList(child as Element, tag === "ol", context, depth + 1));
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

function serializeCodeBlock(pre: Element): string {
  const code = querySelector(pre, "code") || pre;
  const language = languageFromCodeElement(code);
  return `\`\`\`${language}\n${String(code.textContent || "").trimEnd()}\n\`\`\``;
}

function languageFromCodeElement(code: Element): string {
  const className = String((code as { className?: unknown }).className || "");
  const match = className.match(/(?:^|\s)language-([^\s]+)/);
  return match ? match[1] : "";
}

function serializeTable(table: Element, context: MarkdownContext): string {
  const rows = querySelectorAll(table, "tr").map((row) =>
    children(row).filter((cell) => tagName(cell) === "th" || tagName(cell) === "td")
  );
  const nonEmptyRows = rows.filter((row) => row.length);
  if (!nonEmptyRows.length) {
    return "";
  }

  const header = nonEmptyRows[0].map((cell) =>
    cleanTableCell(serializeInlineChildren(cell, context))
  );
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

function markdownTableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function cleanTableCell(text: string): string {
  return cleanInlineText(text).replace(/\|/g, "\\|");
}

function findFormulaElement(node: Node, context: MarkdownContext): Element | null {
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

function formatFormulaElement(formula: Element, context: MarkdownContext): string {
  const extracted = context.extractor.extractLatexFromElement(formula);
  if (!extracted || !extracted.latex) {
    return "";
  }

  if (context.emittedFormulas) {
    context.emittedFormulas.add(formula);
  }

  return context.formatter.formatFormula(extracted, context.options);
}

function formatInlineCode(text: unknown): string {
  const value = String(text || "");
  const backtickRuns = value.match(/`+/g) || [];
  const fenceLength = Math.max(1, ...backtickRuns.map((run) => run.length + 1));
  const fence = "`".repeat(fenceLength);
  return `${fence}${value}${fence}`;
}

function hasBlockChildren(node: Element): boolean {
  return children(node).some(isBlockElement);
}

function isBlockElement(node: Node): boolean {
  return /^(blockquote|div|h[1-6]|hr|ol|p|pre|table|ul)$/.test(tagName(node));
}

function cleanMarkdown(text: unknown): string {
  return String(text || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanInlineText(text: unknown): string {
  return String(text || "")
    .replace(/[ \t\n]+/g, " ")
    .trim();
}

function cleanParagraphText(text: unknown): string {
  const value = String(text || "");
  return value.includes("\n") ? cleanMarkdown(value) : cleanInlineText(value);
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

function children(node: unknown): Element[] {
  return Array.from((node as { children?: Element[] } | null)?.children || []).filter(
    isElementLike
  );
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
