(function registerCopyTeXSelectionSerializer(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CopyTeXSelectionSerializer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSelectionSerializer() {
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const DOCUMENT_FRAGMENT_NODE = 11;

  function serializeSelectionToLatexText(selection, extractor) {
    if (!selection || !extractor || !selection.rangeCount) {
      return { handled: false, text: "" };
    }

    const parts = [];
    let foundFormula = false;

    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index);
      if (!range || range.collapsed) {
        continue;
      }

      const result = serializeRangeToLatexText(range, extractor);
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

  function serializeRangeToLatexText(range, extractor) {
    const emittedFormulas = new WeakSet();
    const chunks = [];
    const state = { foundFormula: false };
    const root = range.commonAncestorContainer;

    serializeNode(root, range, extractor, emittedFormulas, chunks, state);

    return {
      foundFormula: state.foundFormula,
      text: cleanSelectionText(chunks.join(""))
    };
  }

  function serializeNode(node, range, extractor, emittedFormulas, chunks, state) {
    if (!node || !rangeIntersectsNode(range, node)) {
      return;
    }

    const formulaHost = node.nodeType === TEXT_NODE ? node.parentElement || node.parentNode : node;
    const formula = extractor.findFormulaElement(formulaHost);
    if (formula && rangeIntersectsNode(range, formula)) {
      emitFormula(formula, extractor, emittedFormulas, chunks, state);
      return;
    }

    if (node.nodeType === TEXT_NODE) {
      chunks.push(textForRange(node, range));
      return;
    }

    if (!isContainerNode(node)) {
      return;
    }

    const children = Array.from(node.childNodes || node.children || []);
    for (const child of children) {
      serializeNode(child, range, extractor, emittedFormulas, chunks, state);
    }
  }

  function emitFormula(formula, extractor, emittedFormulas, chunks, state) {
    if (emittedFormulas.has(formula)) {
      return;
    }

    const extracted = extractor.extractLatexFromElement(formula);
    if (!extracted || !extracted.latex) {
      return;
    }

    emittedFormulas.add(formula);
    state.foundFormula = true;
    chunks.push(formatFormulaForSelection(extracted));
  }

  function formatFormulaForSelection(extracted) {
    if (extracted.displayMode) {
      return `\n\\[${extracted.latex}\\]\n`;
    }

    return `\\(${extracted.latex}\\)`;
  }

  function textForRange(textNode, range) {
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

  function cleanSelectionText(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isContainerNode(node) {
    return node.nodeType === ELEMENT_NODE || node.nodeType === DOCUMENT_FRAGMENT_NODE;
  }

  function rangeIntersectsNode(range, node) {
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

  function containsNode(parent, child) {
    if (!parent || !child) {
      return false;
    }

    if (parent === child) {
      return true;
    }

    if (typeof parent.contains === "function") {
      return parent.contains(child);
    }

    let cursor = child;
    while (cursor) {
      if (cursor === parent) {
        return true;
      }
      cursor = cursor.parentElement || cursor.parentNode || null;
    }

    return false;
  }

  return {
    cleanSelectionText,
    formatFormulaForSelection,
    serializeRangeToLatexText,
    serializeSelectionToLatexText
  };
});
