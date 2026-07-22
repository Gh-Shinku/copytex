import type { FormulaExtractionResult } from "./shared/types";

const KATEX_SELECTOR = ".katex";
const KATEX_DISPLAY_SELECTORS = [
  ".katex-display",
  ".ds-markdown-math-display",
  ".ds-markdown-math-block"
];
const ZHIHU_MATH_SELECTOR = ".ztext-math";
const ZHIHU_DISPLAY_SELECTORS = [
  ".MathJax_SVG_Display",
  ".MathJax_Display",
  ".mjx-display"
];
const DEEPSEEK_MARKDOWN_SELECTOR = ".ds-markdown";
const DEEPSEEK_PARAGRAPH_SELECTOR = ".ds-markdown-paragraph";

interface ScriptLatexResult {
  latex: string;
  displayMode: boolean;
}

export function extractLatexFromElement(target: unknown): FormulaExtractionResult | null {
  const formulaElement = findFormulaElement(target);

  if (!formulaElement) {
    return null;
  }

  const zhihuLatex = findZhihuDataTex(formulaElement);
  if (zhihuLatex) {
    return {
      latex: zhihuLatex,
      displayMode: isZhihuDisplayFormula(formulaElement),
      source: "zhihu-data-tex"
    };
  }

  const annotationLatex = findAnnotationLatex(formulaElement);
  if (annotationLatex) {
    return {
      latex: annotationLatex,
      displayMode: isDisplayFormula(formulaElement),
      source: "annotation"
    };
  }

  const scriptResult = findNearbyScriptLatex(formulaElement);
  if (scriptResult) {
    return {
      latex: scriptResult.latex,
      displayMode: scriptResult.displayMode || isDisplayFormula(formulaElement),
      source: "script"
    };
  }

  return null;
}

export function findFormulaElement(target: unknown): Element | null {
  if (!isElementLike(target)) {
    return null;
  }

  const display = closestAny(target, KATEX_DISPLAY_SELECTORS);
  const inline = closest(target, KATEX_SELECTOR);
  const zhihu = closest(target, ZHIHU_MATH_SELECTOR);

  if (zhihu) {
    return zhihu;
  }

  if (display && (!inline || contains(display, inline))) {
    return display;
  }

  return inline || display || null;
}

export function isDisplayFormula(element: unknown): boolean {
  return (
    Boolean(closestAny(element, KATEX_DISPLAY_SELECTORS)) ||
    isZhihuDisplayFormula(element) ||
    isDeepSeekDisplayFormula(element)
  );
}

export function cleanLatex(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

function findZhihuDataTex(root: unknown): string | null {
  const zhihuFormula = matches(root, ZHIHU_MATH_SELECTOR)
    ? root
    : closest(root, ZHIHU_MATH_SELECTOR);
  const latex = zhihuFormula
    ? cleanLatex(decodeHtmlAttribute(getAttribute(zhihuFormula, "data-tex")))
    : "";
  return latex || null;
}

function isZhihuDisplayFormula(element: unknown): boolean {
  const formula = matches(element, ZHIHU_MATH_SELECTOR)
    ? element
    : closest(element, ZHIHU_MATH_SELECTOR);

  if (!formula) {
    return false;
  }

  if (getAttribute(formula, "data-eeimg") === "2") {
    return true;
  }

  if (hasDescendantMatchingAny(formula, ZHIHU_DISPLAY_SELECTORS)) {
    return true;
  }

  const scriptResult = findScriptLatexInside(formula);
  return Boolean(scriptResult && scriptResult.displayMode);
}

function findAnnotationLatex(root: unknown): string | null {
  const annotations = querySelectorAll(root, "annotation");

  for (const annotation of annotations) {
    const encoding = getAttribute(annotation, "encoding").toLowerCase();
    if (encoding === "application/x-tex") {
      const latex = cleanLatex(annotation.textContent);
      if (latex) {
        return latex;
      }
    }
  }

  const fallback = querySelector(root, ".katex-mathml annotation");
  const latex = fallback ? cleanLatex(fallback.textContent) : "";
  return latex || null;
}

function findNearbyScriptLatex(formulaElement: Element): ScriptLatexResult | null {
  const directScript = findScriptLatexInside(formulaElement);
  if (directScript) {
    return directScript;
  }

  let cursor: Element | Node | null = formulaElement;
  for (let depth = 0; depth < 3 && cursor; depth += 1) {
    const siblingResult = findScriptLatexNearSiblings(cursor);
    if (siblingResult) {
      return siblingResult;
    }
    cursor = cursor.parentElement || cursor.parentNode || null;
  }

  return null;
}

function findScriptLatexInside(root: unknown): ScriptLatexResult | null {
  const scripts = querySelectorAll(root, "script");

  for (const script of scripts) {
    const result = scriptToLatex(script);
    if (result) {
      return result;
    }
  }

  return null;
}

function findScriptLatexNearSiblings(element: Element | Node): ScriptLatexResult | null {
  let previous = getElementProperty<Element | null>(element, "previousElementSibling") || null;
  for (let i = 0; i < 3 && previous; i += 1) {
    const result = scriptToLatex(previous) || findScriptLatexInside(previous);
    if (result) {
      return result;
    }
    previous = previous.previousElementSibling || null;
  }

  let next = getElementProperty<Element | null>(element, "nextElementSibling") || null;
  for (let i = 0; i < 3 && next; i += 1) {
    const result = scriptToLatex(next) || findScriptLatexInside(next);
    if (result) {
      return result;
    }
    next = next.nextElementSibling || null;
  }

  return null;
}

function scriptToLatex(element: unknown): ScriptLatexResult | null {
  if (!matches(element, "script")) {
    return null;
  }

  const type = getAttribute(element, "type").toLowerCase();
  if (!type.startsWith("math/tex")) {
    return null;
  }

  const latex = cleanLatex(getTextContent(element));
  if (!latex) {
    return null;
  }

  return {
    latex,
    displayMode: type.includes("mode=display")
  };
}

function decodeHtmlAttribute(value: unknown): string {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
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

function closestAny(element: unknown, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const match = closest(element, selector);
    if (match) {
      return match;
    }
  }

  return null;
}

function hasDescendantMatchingAny(root: unknown, selectors: string[]): boolean {
  for (const selector of selectors) {
    if (querySelector(root, selector)) {
      return true;
    }
  }

  return false;
}

function isDeepSeekDisplayFormula(element: unknown): boolean {
  const katex = closest(element, KATEX_SELECTOR) || element;
  const paragraph = closest(katex, DEEPSEEK_PARAGRAPH_SELECTOR);

  if (!paragraph || !closest(katex, DEEPSEEK_MARKDOWN_SELECTOR)) {
    return false;
  }

  const paragraphChild = directChildWithin(paragraph, katex);
  if (!paragraphChild) {
    return false;
  }

  if (isFormulaOnlyDeepSeekParagraph(paragraph, paragraphChild)) {
    return true;
  }

  if (hasLineBreakBoundary(paragraphChild)) {
    return true;
  }

  return /[:：]\s*$/.test(previousElementText(paragraphChild));
}

function isFormulaOnlyDeepSeekParagraph(paragraph: Element, formulaChild: Element | Node): boolean {
  const children = Array.from(paragraph.children || []);
  let hasFormula = false;

  for (const child of children) {
    if (child === formulaChild || contains(child, formulaChild)) {
      hasFormula = true;
      continue;
    }

    if (isIgnorableDeepSeekSibling(child)) {
      continue;
    }

    return false;
  }

  return hasFormula;
}

function hasLineBreakBoundary(element: Element | Node): boolean {
  return (
    isLineBreakOrEmptySpan(previousElement(element)) ||
    isLineBreakOrEmptySpan(nextElement(element))
  );
}

function previousElementText(element: Element | Node): string {
  let cursor = previousElement(element);
  while (cursor) {
    if (!isLineBreakOrEmptySpan(cursor)) {
      return cleanLatex(cursor.textContent || "");
    }
    cursor = previousElement(cursor);
  }
  return "";
}

function isIgnorableDeepSeekSibling(element: unknown): boolean {
  return isLineBreakOrEmptySpan(element);
}

function isLineBreakOrEmptySpan(element: unknown): boolean {
  if (!element) {
    return false;
  }

  if (matches(element, "br")) {
    return true;
  }

  return matches(element, "span") && !cleanLatex(getTextContent(element) || "");
}

function directChildWithin(parent: Element, descendant: unknown): Element | Node | null {
  let cursor = isNodeLike(descendant) ? descendant : null;
  let last: Element | Node | null = null;
  while (cursor && cursor !== parent) {
    last = cursor;
    cursor = cursor.parentElement || cursor.parentNode || null;
  }
  return cursor === parent ? last : null;
}

function previousElement(element: Element | Node): Element | null {
  return getElementProperty<Element | null>(element, "previousElementSibling") || null;
}

function nextElement(element: Element | Node): Element | null {
  return getElementProperty<Element | null>(element, "nextElementSibling") || null;
}

function matches(element: unknown, selector: string): boolean {
  if (!isElementLike(element)) {
    return false;
  }

  if (typeof element.matches === "function") {
    return element.matches(selector);
  }

  if (selector === "script") {
    return String(element.tagName || "").toLowerCase() === "script";
  }

  if (selector.startsWith(".")) {
    return hasClass(element, selector.slice(1));
  }

  return String(element.tagName || "").toLowerCase() === selector.toLowerCase();
}

function hasClass(element: Element, className: string): boolean {
  if (element.classList && typeof element.classList.contains === "function") {
    return element.classList.contains(className);
  }

  return String((element as { className?: unknown }).className || "")
    .split(/\s+/)
    .includes(className);
}

function contains(parent: unknown, child: unknown): boolean {
  if (!parent || !child) {
    return false;
  }

  if (isNodeLike(parent) && isNodeLike(child) && typeof parent.contains === "function") {
    return parent.contains(child);
  }

  let cursor = isNodeLike(child) ? child : null;
  while (cursor) {
    if (cursor === parent) {
      return true;
    }
    cursor = cursor.parentElement || cursor.parentNode || null;
  }

  return false;
}

function querySelector(root: unknown, selector: string): Element | null {
  if (root && typeof (root as ParentNode).querySelector === "function") {
    return (root as ParentNode).querySelector(selector);
  }
  return null;
}

function querySelectorAll(root: unknown, selector: string): Element[] {
  if (root && typeof (root as ParentNode).querySelectorAll === "function") {
    return Array.from((root as ParentNode).querySelectorAll(selector));
  }
  return [];
}

function getAttribute(element: unknown, name: string): string {
  if (element && typeof (element as Element).getAttribute === "function") {
    return (element as Element).getAttribute(name) || "";
  }
  return "";
}

function getTextContent(element: unknown): string {
  return String((element as { textContent?: unknown } | null)?.textContent || "");
}

function getElementProperty<T>(element: unknown, property: string): T | null {
  return ((element as Record<string, unknown> | null)?.[property] as T | undefined) || null;
}

function isElementLike(value: unknown): value is Element {
  return Boolean(
    value &&
      ((value as Node).nodeType === 1 || typeof (value as Element).tagName === "string")
  );
}

function isNodeLike(value: unknown): value is Node {
  return Boolean(value && typeof (value as Node).nodeType === "number");
}

export const extractorApi = {
  cleanLatex,
  extractLatexFromElement,
  findFormulaElement,
  isDisplayFormula
};

(globalThis as typeof globalThis & { CopyTeXExtractor?: typeof extractorApi }).CopyTeXExtractor =
  extractorApi;
