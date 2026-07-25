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
      ? serializeDocumentFragment(node, context)
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

function serializeDocumentFragment(node: Node, context: MarkdownContext): string {
  return hasBlockChildren(node)
    ? serializeBlockChildren(node, context)
    : cleanParagraphText(serializeInlineChildren(node, context));
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

  if (isIgnoredNode(node)) {
    return "";
  }

  const tag = tagName(node);
  if (tag === "style" || tag === "script" || tag === "link") {
    return "";
  }

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

  if (tag === "dl") {
    return serializeDefinitionList(node, context);
  }

  if (tag === "dt" || tag === "dd") {
    return cleanParagraphText(serializeInlineChildren(node, context));
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

  if (tag === "figure") {
    return serializeFigure(node, context);
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

  if (isIgnoredNode(node)) {
    return "";
  }

  const tag = tagName(node);
  if (tag === "style" || tag === "script" || tag === "link") {
    return "";
  }

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

  if (tag === "sub" || tag === "sup") {
    const text = serializeInlineChildren(node, context);
    return text ? `<${tag}>${text}</${tag}>` : "";
  }

  if (tag === "a") {
    const text = serializeInlineChildren(node, context) || getAttribute(node, "href");
    const href = getAttribute(node, "href");
    if (isIgnoredLink(node, href)) {
      return text;
    }
    const normalizedHref = normalizeLinkHref(href, context);
    return normalizedHref ? `[${text}](${normalizedHref})` : text;
  }

  if (tag === "img") {
    const alt = getAttribute(node, "alt");
    const src = getAttribute(node, "src");
    if (isMediaWikiFileImage(node)) {
      return alt;
    }
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

function serializeDefinitionList(listNode: Element, context: MarkdownContext): string {
  return childNodes(listNode)
    .map((child) => {
      const tag = tagName(child);
      if (tag === "dt") {
        const text = cleanInlineText(serializeInlineChildren(child, context));
        return text ? `**${text}**` : "";
      }
      if (tag === "dd") {
        return cleanParagraphText(serializeInlineChildren(child, context));
      }
      return serializeBlockNode(child, context);
    })
    .filter(Boolean)
    .join("\n\n");
}

function serializeCodeBlock(pre: Element): string {
  const code = querySelector(pre, "code") || pre;
  const language =
    languageFromCodeElement(code) ||
    languageFromCodeElement(pre) ||
    languageFromCodeElement(parentElement(pre));
  return `\`\`\`${language}\n${String(code.textContent || "").trimEnd()}\n\`\`\``;
}

function languageFromCodeElement(code: Element | null): string {
  const className = String((code as { className?: unknown } | null)?.className || "");
  const match = className.match(/(?:^|\s)(?:language-|mw-highlight-lang-)([^\s]+)/);
  return match ? match[1] : "";
}

function serializeFigure(figure: Element, context: MarkdownContext): string {
  const caption = querySelector(figure, "figcaption");
  const captionText = caption ? cleanParagraphText(serializeInlineChildren(caption, context)) : "";
  if (captionText) {
    return captionText;
  }

  const image = querySelector(figure, "img");
  return image ? cleanInlineText(getAttribute(image, "alt")) : "";
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

function hasBlockChildren(node: Node): boolean {
  return children(node).some(isBlockElement);
}

function isBlockElement(node: Node): boolean {
  return /^(blockquote|div|dl|dd|dt|figure|h[1-6]|hr|li|ol|p|pre|table|ul)$/.test(tagName(node));
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

function isIgnoredNode(element: Element): boolean {
  const tag = tagName(element);
  if (tag === "style" || tag === "script" || tag === "link") {
    return true;
  }

  if (getAttribute(element, "aria-hidden") === "true") {
    return true;
  }

  return [
    "mw-editsection",
    "reference",
    "noprint",
    "metadata",
    "navbox"
  ].some((className) => hasClass(element, className));
}

function isMediaWikiFileImage(element: Element): boolean {
  return hasClass(element, "mw-file-element") || Boolean(closest(element, "figure"));
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

function normalizeLinkHref(value: unknown, context: MarkdownContext): string {
  const href = String(value || "").trim();
  if (!href) {
    return "";
  }

  const unwrapped = unwrapZhihuRedirectUrl(href);
  const normalized = unwrapped || href;
  if (isDangerousHref(normalized)) {
    return "";
  }

  if (isWikipediaBaseUrl(context.options.baseUrl)) {
    return absoluteUrl(normalized, context.options.baseUrl);
  }

  return normalized;
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

function isDangerousHref(value: string): boolean {
  return /^(?:javascript|data|vbscript):/i.test(value.trim());
}

function isWikipediaBaseUrl(value: unknown): value is string {
  const baseUrl = String(value || "").trim();
  if (!baseUrl) {
    return false;
  }

  try {
    const url = new URL(baseUrl);
    return isWikipediaHost(url.hostname);
  } catch (_error) {
    return false;
  }
}

function isWikipediaHost(hostname: string): boolean {
  return hostname === "wikipedia.org" || hostname.endsWith(".wikipedia.org");
}

function absoluteUrl(value: string, baseUrl: string): string {
  const normalized = value.startsWith("//") ? `https:${value}` : value;
  try {
    return new URL(normalized, baseUrl).href;
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

function parentElement(node: unknown): Element | null {
  return ((node as { parentElement?: Element | null } | null)?.parentElement ||
    (node as { parentNode?: Element | null } | null)?.parentNode ||
    null) as Element | null;
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

function closest(element: unknown, selector: string): Element | null {
  if (!isElementLike(element)) {
    return null;
  }

  if (typeof element.closest === "function") {
    return element.closest(selector);
  }

  let cursor: Element | Node | null = element;
  while (cursor) {
    if (matches(cursor, selector)) {
      return cursor as Element;
    }
    cursor = cursor.parentElement || cursor.parentNode || null;
  }

  return null;
}

function matches(element: unknown, selector: string): boolean {
  if (!isElementLike(element)) {
    return false;
  }

  if (typeof element.matches === "function") {
    return element.matches(selector);
  }

  if (selector.startsWith(".")) {
    return hasClass(element, selector.slice(1));
  }

  return tagName(element) === selector.toLowerCase();
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
