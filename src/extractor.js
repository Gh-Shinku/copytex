(function registerCopyTeXExtractor(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CopyTeXExtractor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createExtractor() {
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

  function extractLatexFromElement(target) {
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

  function findFormulaElement(target) {
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

  function isDisplayFormula(element) {
    return (
      Boolean(closestAny(element, KATEX_DISPLAY_SELECTORS)) ||
      isZhihuDisplayFormula(element) ||
      isDeepSeekDisplayFormula(element)
    );
  }

  function findZhihuDataTex(root) {
    const zhihuFormula = matches(root, ZHIHU_MATH_SELECTOR)
      ? root
      : closest(root, ZHIHU_MATH_SELECTOR);
    const latex = zhihuFormula ? cleanLatex(decodeHtmlAttribute(getAttribute(zhihuFormula, "data-tex"))) : "";
    return latex || null;
  }

  function isZhihuDisplayFormula(element) {
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

  function findAnnotationLatex(root) {
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

  function findNearbyScriptLatex(formulaElement) {
    const directScript = findScriptLatexInside(formulaElement);
    if (directScript) {
      return directScript;
    }

    let cursor = formulaElement;
    for (let depth = 0; depth < 3 && cursor; depth += 1) {
      const siblingResult = findScriptLatexNearSiblings(cursor);
      if (siblingResult) {
        return siblingResult;
      }
      cursor = cursor.parentElement || cursor.parentNode || null;
    }

    return null;
  }

  function findScriptLatexInside(root) {
    const scripts = querySelectorAll(root, "script");

    for (const script of scripts) {
      const result = scriptToLatex(script);
      if (result) {
        return result;
      }
    }

    return null;
  }

  function findScriptLatexNearSiblings(element) {
    let previous = element.previousElementSibling || null;
    for (let i = 0; i < 3 && previous; i += 1) {
      const result = scriptToLatex(previous) || findScriptLatexInside(previous);
      if (result) {
        return result;
      }
      previous = previous.previousElementSibling || null;
    }

    let next = element.nextElementSibling || null;
    for (let i = 0; i < 3 && next; i += 1) {
      const result = scriptToLatex(next) || findScriptLatexInside(next);
      if (result) {
        return result;
      }
      next = next.nextElementSibling || null;
    }

    return null;
  }

  function scriptToLatex(element) {
    if (!matches(element, "script")) {
      return null;
    }

    const type = getAttribute(element, "type").toLowerCase();
    if (!type.startsWith("math/tex")) {
      return null;
    }

    const latex = cleanLatex(element.textContent);
    if (!latex) {
      return null;
    }

    return {
      latex,
      displayMode: type.includes("mode=display")
    };
  }

  function cleanLatex(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  }

  function decodeHtmlAttribute(value) {
    return String(value || "")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  function closest(element, selector) {
    if (!isElementLike(element)) {
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

  function closestAny(element, selectors) {
    for (const selector of selectors) {
      const match = closest(element, selector);
      if (match) {
        return match;
      }
    }

    return null;
  }

  function hasDescendantMatchingAny(root, selectors) {
    for (const selector of selectors) {
      if (querySelector(root, selector)) {
        return true;
      }
    }

    return false;
  }

  function isDeepSeekDisplayFormula(element) {
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

  function isFormulaOnlyDeepSeekParagraph(paragraph, formulaChild) {
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

  function hasLineBreakBoundary(element) {
    return (
      isLineBreakOrEmptySpan(previousElement(element)) ||
      isLineBreakOrEmptySpan(nextElement(element))
    );
  }

  function previousElementText(element) {
    let cursor = previousElement(element);
    while (cursor) {
      if (!isLineBreakOrEmptySpan(cursor)) {
        return cleanLatex(cursor.textContent || "");
      }
      cursor = previousElement(cursor);
    }
    return "";
  }

  function isIgnorableDeepSeekSibling(element) {
    return isLineBreakOrEmptySpan(element);
  }

  function isLineBreakOrEmptySpan(element) {
    if (!element) {
      return false;
    }

    if (matches(element, "br")) {
      return true;
    }

    return matches(element, "span") && !cleanLatex(element.textContent || "");
  }

  function directChildWithin(parent, descendant) {
    let cursor = descendant;
    let last = null;
    while (cursor && cursor !== parent) {
      last = cursor;
      cursor = cursor.parentElement || cursor.parentNode || null;
    }
    return cursor === parent ? last : null;
  }

  function previousElement(element) {
    return element ? element.previousElementSibling || null : null;
  }

  function nextElement(element) {
    return element ? element.nextElementSibling || null : null;
  }

  function matches(element, selector) {
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

  function hasClass(element, className) {
    if (element.classList && typeof element.classList.contains === "function") {
      return element.classList.contains(className);
    }

    return String(element.className || "")
      .split(/\s+/)
      .includes(className);
  }

  function contains(parent, child) {
    if (!parent || !child) {
      return false;
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

  function querySelector(root, selector) {
    if (root && typeof root.querySelector === "function") {
      return root.querySelector(selector);
    }
    return null;
  }

  function querySelectorAll(root, selector) {
    if (root && typeof root.querySelectorAll === "function") {
      return Array.from(root.querySelectorAll(selector));
    }
    return [];
  }

  function getAttribute(element, name) {
    if (element && typeof element.getAttribute === "function") {
      return element.getAttribute(name) || "";
    }
    return "";
  }

  function isElementLike(value) {
    return Boolean(value && (value.nodeType === 1 || typeof value.tagName === "string"));
  }

  return {
    cleanLatex,
    extractLatexFromElement,
    findFormulaElement,
    isDisplayFormula
  };
});
