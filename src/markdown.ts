import type { FormatOptions, FormulaExtractionResult } from "./shared/types";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const DOCUMENT_FRAGMENT_NODE = 11;

export interface MarkdownExtractor {
  findFormulaElement(node: unknown): Element | null;
  extractLatexFromElement(node: unknown): FormulaExtractionResult | null;
}

export interface MarkdownFormulaFormatter {
  formatFormula(extracted: FormulaExtractionResult, options?: FormatOptions): string;
}

interface MarkdownContext {
  extractor: MarkdownExtractor;
  formatter: MarkdownFormulaFormatter;
  options: FormatOptions;
  emittedFormulas: WeakSet<Element> | null;
}

export function serializeMarkdown(
  node: Node | null | undefined,
  extractor: MarkdownExtractor,
  formatter: MarkdownFormulaFormatter,
  options?: FormatOptions
): string {
  if (!node) {
    return "";
  }

  const context = createMarkdownContext(extractor, formatter, options);
  const text =
    node.nodeType === DOCUMENT_FRAGMENT_NODE
      ? serializeBlockChildren(node, context)
      : serializeBlockNode(node, context);

  return cleanMarkdown(text);
}

export function serializeMarkdownChildren(
  node: Node | null | undefined,
  extractor: MarkdownExtractor,
  formatter: MarkdownFormulaFormatter,
  options?: FormatOptions
): string {
  if (!node) {
    return "";
  }

  return cleanMarkdown(serializeBlockChildren(node, createMarkdownContext(extractor, formatter, options)));
}

function createMarkdownContext(
  extractor: MarkdownExtractor,
  formatter: MarkdownFormulaFormatter,
  options?: FormatOptions
): MarkdownContext {
  return {
    extractor,
    formatter,
    options: options || {},
    emittedFormulas: typeof WeakSet === "function" ? new WeakSet<Element>() : null
  };
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
    if (isIgnoredLink(node, href)) {
      return text;
    }
    const normalizedHref = normalizeLinkHref(href);
    return normalizedHref ? `[${text}](${normalizedHref})` : text;
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

function getAttribute(element: unknown, name: string): string {
  if (element && typeof (element as Element).getAttribute === "function") {
    return (element as Element).getAttribute(name) || "";
  }
  return "";
}

function isIgnoredLink(element: Element, href: string): boolean {
  if (hasClass(element, "RichContent-EntityWord")) {
    return true;
  }

  return isZhidaUrl(href);
}

function isZhidaUrl(value: unknown): boolean {
  const href = String(value || "").trim();
  if (!href) {
    return false;
  }

  const normalized = href.startsWith("//") ? `https:${href}` : href;
  try {
    return new URL(normalized, "https://www.zhihu.com").hostname === "zhida.zhihu.com";
  } catch (_error) {
    return /^https?:\/\/zhida\.zhihu\.com(?:\/|$)/i.test(normalized);
  }
}

function normalizeLinkHref(value: unknown): string {
  const href = String(value || "").trim();
  if (!href) {
    return "";
  }

  return unwrapZhihuRedirectUrl(href) || href;
}

function unwrapZhihuRedirectUrl(value: string): string {
  const normalized = value.startsWith("//") ? `https:${value}` : value;
  try {
    const url = new URL(normalized, "https://www.zhihu.com");
    if (url.hostname !== "link.zhihu.com") {
      return "";
    }

    return url.searchParams.get("target") || "";
  } catch (_error) {
    return "";
  }
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

  if (selector === "code" || selector === "tr") {
    return tagName(node) === selector;
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
  return Array.from(
    ((node as { childNodes?: Node[]; children?: Node[] } | null) &&
      ((node as { childNodes?: Node[]; children?: Node[] }).childNodes ||
        (node as { childNodes?: Node[]; children?: Node[] }).children)) ||
      []
  );
}

function children(node: unknown): Element[] {
  return Array.from((node as { children?: Element[] } | null)?.children || []).filter(
    isElementLike
  );
}

function tagName(node: unknown): string {
  return String((node as { tagName?: unknown } | null)?.tagName || "").toLowerCase();
}

function hasClass(element: unknown, className: string): boolean {
  if (
    element &&
    (element as Element).classList &&
    typeof (element as Element).classList.contains === "function"
  ) {
    return (element as Element).classList.contains(className);
  }

  return String((element as { className?: unknown } | null)?.className || "")
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

export const markdownSerializerApi = {
  serializeMarkdown,
  serializeMarkdownChildren
};

(
  globalThis as typeof globalThis & {
    CopyTeXMarkdownSerializer?: typeof markdownSerializerApi;
  }
).CopyTeXMarkdownSerializer = markdownSerializerApi;
