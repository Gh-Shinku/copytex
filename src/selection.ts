import {
  formatFormula as formatFormulaSource,
  formatFormulaForSelection as formatFormulaForSelectionSource,
  normalizeOutputOptions
} from "./domain/formatter";
import { serializeMarkdown } from "./markdown";
import type {
  FormatOptions,
  FormulaExtractionResult
} from "./shared/types";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const DOCUMENT_FRAGMENT_NODE = 11;

interface FormulaExtractor {
  findFormulaElement(target: unknown): Element | null;
  extractLatexFromElement(target: unknown): FormulaExtractionResult | null;
}

interface FormulaFormatter {
  formatFormula(extracted: FormulaExtractionResult, options?: FormatOptions): string;
}

interface SerializationState {
  foundFormula: boolean;
}

export function serializeSelectionToLatexText(
  selection: Selection | null | undefined,
  extractor: FormulaExtractor,
  options?: FormatOptions
): { handled: boolean; text: string } {
  if (!selection || !extractor || !selection.rangeCount) {
    return { handled: false, text: "" };
  }

  const normalizedOptions = normalizeOptions(options);
  const parts: string[] = [];
  let foundFormula = false;

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (!range || range.collapsed) {
      continue;
    }

    const result = serializeRangeToLatexText(range, extractor, normalizedOptions);
    if (result.foundFormula) {
      foundFormula = true;
    }
    if (result.text) {
      parts.push(result.text);
    }
  }

  if (!foundFormula) {
    return { handled: false, text: "" };
  }

  return {
    handled: true,
    text: cleanSelectionText(parts.join("\n"))
  };
}

export function serializeRangeToLatexText(
  range: Range,
  extractor: FormulaExtractor,
  options?: FormatOptions
): { foundFormula: boolean; text: string } {
  const normalizedOptions = normalizeOptions(options);
  const emittedFormulas = new WeakSet<Element>();
  const chunks: string[] = [];
  const state = { foundFormula: false };
  const root = range.commonAncestorContainer;

  serializeNode(root, range, extractor, emittedFormulas, chunks, state, normalizedOptions);

  return {
    foundFormula: state.foundFormula,
    text: cleanSelectionText(chunks.join(""))
  };
}

export function serializeSelectionToMarkdownText(
  selection: Selection | null | undefined,
  extractor: FormulaExtractor,
  formatter: FormulaFormatter,
  options?: FormatOptions
): { handled: boolean; text: string } {
  if (!selection || !extractor || !formatter || !selection.rangeCount) {
    return { handled: false, text: "" };
  }

  const parts: string[] = [];

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (!range || range.collapsed) {
      continue;
    }

    const text = serializeRangeToMarkdownText(range, extractor, formatter, options);
    if (text) {
      parts.push(text);
    }
  }

  const text = cleanSelectionText(parts.join("\n\n"));
  return text ? { handled: true, text } : { handled: false, text: "" };
}

export function serializeRangeToMarkdownText(
  range: Range,
  extractor: FormulaExtractor,
  formatter: FormulaFormatter,
  options?: FormatOptions
): string {
  if (!range || range.collapsed) {
    return "";
  }

  const source =
    typeof range.cloneContents === "function"
      ? range.cloneContents()
      : range.commonAncestorContainer;

  return serializeMarkdown(source, extractor, formatter, options);
}

function serializeNode(
  node: Node,
  range: Range,
  extractor: FormulaExtractor,
  emittedFormulas: WeakSet<Element>,
  chunks: string[],
  state: SerializationState,
  options: FormatOptions
): void {
  if (!node || !rangeIntersectsNode(range, node)) {
    return;
  }

  const formulaHost = node.nodeType === TEXT_NODE ? node.parentElement || node.parentNode : node;
  const formula = extractor.findFormulaElement(formulaHost);
  if (formula && rangeIntersectsNode(range, formula)) {
    emitFormula(formula, extractor, emittedFormulas, chunks, state, options);
    return;
  }

  if (node.nodeType === TEXT_NODE) {
    chunks.push(textForRange(node, range));
    return;
  }

  if (!isContainerNode(node)) {
    return;
  }

  const children = Array.from(node.childNodes || (node as unknown as ParentNode).children || []);
  for (const child of children) {
    serializeNode(child, range, extractor, emittedFormulas, chunks, state, options);
  }
}

function emitFormula(
  formula: Element,
  extractor: FormulaExtractor,
  emittedFormulas: WeakSet<Element>,
  chunks: string[],
  state: SerializationState,
  options: FormatOptions
): void {
  if (emittedFormulas.has(formula)) {
    return;
  }

  const extracted = extractor.extractLatexFromElement(formula);
  if (!extracted || !extracted.latex) {
    return;
  }

  emittedFormulas.add(formula);
  state.foundFormula = true;
  chunks.push(formatFormulaForSelection(extracted, options));
}

export function formatFormulaForSelection(
  extracted: FormulaExtractionResult | null | undefined,
  options?: FormatOptions
): string {
  return formatFormulaForSelectionSource(extracted, options);
}

export function formatFormula(
  extracted: FormulaExtractionResult | null | undefined,
  options?: FormatOptions
): string {
  return formatFormulaSource(extracted, options);
}

export function normalizeOptions(options?: FormatOptions) {
  return normalizeOutputOptions(options);
}

function textForRange(textNode: Node, range: Range): string {
  const value = textNode.nodeValue || textNode.textContent || "";
  let start = 0;
  let end = value.length;

  if (range.startContainer === textNode) {
    start = Math.max(0, Math.min(value.length, range.startOffset));
  }
  if (range.endContainer === textNode) {
    end = Math.max(0, Math.min(value.length, range.endOffset));
  }

  if (end <= start) {
    return "";
  }

  return value.slice(start, end);
}

export function cleanSelectionText(text: unknown): string {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isContainerNode(node: Node): boolean {
  return node.nodeType === ELEMENT_NODE || node.nodeType === DOCUMENT_FRAGMENT_NODE;
}

function rangeIntersectsNode(range: Range, node: Node): boolean {
  if (!node) {
    return false;
  }

  if (typeof range.intersectsNode === "function") {
    try {
      if (range.intersectsNode(node)) {
        return true;
      }
    } catch (_error) {
      return true;
    }
  }

  return containsNode(node, range.commonAncestorContainer);
}

function containsNode(parent: Node, child: Node): boolean {
  if (!parent || !child) {
    return false;
  }

  if (parent === child) {
    return true;
  }

  if (typeof parent.contains === "function") {
    return parent.contains(child);
  }

  let cursor: Node | null = child;
  while (cursor) {
    if (cursor === parent) {
      return true;
    }
    cursor = cursor.parentElement || cursor.parentNode || null;
  }

  return false;
}

export const selectionSerializerApi = {
  cleanSelectionText,
  formatFormula,
  formatFormulaForSelection,
  normalizeOptions,
  serializeRangeToMarkdownText,
  serializeRangeToLatexText,
  serializeSelectionToMarkdownText,
  serializeSelectionToLatexText
};

(
  globalThis as typeof globalThis & {
    CopyTeXSelectionSerializer?: typeof selectionSerializerApi;
  }
).CopyTeXSelectionSerializer = selectionSerializerApi;
