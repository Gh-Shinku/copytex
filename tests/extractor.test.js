const assert = require("node:assert/strict");
const test = require("node:test");
const {
  cleanLatex,
  extractLatexFromElement,
  findFormulaElement,
  isDisplayFormula
} = require("../src/extractor");

class NodeStub {
  constructor(tagName, options = {}) {
    this.tagName = tagName;
    this.nodeType = 1;
    this.className = options.className || "";
    this.attributes = options.attributes || {};
    this.textContent = options.textContent || "";
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.previousElementSibling = null;
    this.nextElementSibling = null;
  }

  append(...children) {
    for (const child of children) {
      const previous = this.children[this.children.length - 1] || null;
      if (previous) {
        previous.nextElementSibling = child;
        child.previousElementSibling = previous;
      }

      child.parentElement = this;
      child.parentNode = this;
      this.children.push(child);
    }
    return this;
  }

  getAttribute(name) {
    return this.attributes[name] || "";
  }

  contains(target) {
    let cursor = target;
    while (cursor) {
      if (cursor === this) {
        return true;
      }
      cursor = cursor.parentElement;
    }
    return false;
  }

  matches(selector) {
    if (selector.startsWith(".")) {
      return this.className.split(/\s+/).includes(selector.slice(1));
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  closest(selector) {
    let cursor = this;
    while (cursor) {
      if (cursor.matches(selector)) {
        return cursor;
      }
      cursor = cursor.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const all = [];
    walk(this, (node) => all.push(node));

    if (selector === "annotation" || selector === "script") {
      return all.filter((node) => node.matches(selector));
    }

    if (selector === ".katex-mathml annotation") {
      return all.filter(
        (node) => node.matches("annotation") && Boolean(node.closest(".katex-mathml"))
      );
    }

    return [];
  }
}

function walk(node, visit) {
  for (const child of node.children) {
    visit(child);
    walk(child, visit);
  }
}

function node(tagName, options, children = []) {
  return new NodeStub(tagName, options).append(...children);
}

test("extracts raw TeX from a KaTeX MathML annotation", () => {
  const annotation = node("annotation", {
    attributes: { encoding: "application/x-tex" },
    textContent: " E = mc^2 "
  });
  const mathml = node("span", { className: "katex-mathml" }, [annotation]);
  const katex = node("span", { className: "katex" }, [mathml]);

  assert.deepEqual(extractLatexFromElement(katex), {
    latex: "E = mc^2",
    displayMode: false,
    source: "annotation"
  });
});

test("marks formulas inside katex-display as display mode", () => {
  const annotation = node("annotation", {
    attributes: { encoding: "application/x-tex" },
    textContent: "\\int_0^1 x\\,dx"
  });
  const katex = node("span", { className: "katex" }, [
    node("span", { className: "katex-mathml" }, [annotation])
  ]);
  const display = node("span", { className: "katex-display" }, [katex]);

  assert.equal(findFormulaElement(annotation), display);
  assert.equal(isDisplayFormula(annotation), true);
  assert.equal(extractLatexFromElement(annotation).displayMode, true);
});

test("marks formulas inside DeepSeek display math wrappers as display mode", () => {
  const annotation = node("annotation", {
    attributes: { encoding: "application/x-tex" },
    textContent: "\\sum_{i=1}^n i"
  });
  const katex = node("span", { className: "katex" }, [
    node("span", { className: "katex-mathml" }, [annotation])
  ]);
  const display = node("span", { className: "ds-markdown-math ds-markdown-math-display" }, [
    katex
  ]);

  assert.equal(findFormulaElement(annotation), display);
  assert.equal(isDisplayFormula(annotation), true);
  assert.equal(extractLatexFromElement(annotation).displayMode, true);
});

test("marks DeepSeek formulas after label colons as display mode", () => {
  const annotation = node("annotation", {
    attributes: { encoding: "application/x-tex" },
    textContent: "18A = 1530"
  });
  const katex = node("span", { className: "katex" }, [
    node("span", { className: "katex-mathml" }, [annotation])
  ]);
  const markdown = node("div", { className: "ds-markdown ds-assistant-message-main-content" }, [
    node("p", { className: "ds-markdown-paragraph" }, [
      node("span", { textContent: "计算：" }),
      katex
    ])
  ]);

  assert.equal(extractLatexFromElement(katex).displayMode, true);
  assert.equal(isDisplayFormula(annotation), true);
  assert.equal(findFormulaElement(annotation), katex);
  assert.ok(markdown.contains(katex));
});

test("keeps DeepSeek formulas in sentence text as inline mode", () => {
  const annotation = node("annotation", {
    attributes: { encoding: "application/x-tex" },
    textContent: "A"
  });
  const katex = node("span", { className: "katex" }, [
    node("span", { className: "katex-mathml" }, [annotation])
  ]);
  node("div", { className: "ds-markdown ds-assistant-message-main-content" }, [
    node("p", { className: "ds-markdown-paragraph" }, [
      node("span", { textContent: "向上的力 " }),
      katex,
      node("span", { textContent: " 作用在支点上" })
    ])
  ]);

  assert.equal(extractLatexFromElement(katex).displayMode, false);
});

test("marks DeepSeek formulas separated by line breaks as display mode", () => {
  const annotation = node("annotation", {
    attributes: { encoding: "application/x-tex" },
    textContent: "A = 85"
  });
  const katex = node("span", { className: "katex" }, [
    node("span", { className: "katex-mathml" }, [annotation])
  ]);
  node("div", { className: "ds-markdown ds-assistant-message-main-content" }, [
    node("p", { className: "ds-markdown-paragraph" }, [
      node("strong", { textContent: "最终答案：" }),
      node("span", { textContent: "" }),
      node("br"),
      node("span", { textContent: "" }),
      node("strong", {}, [katex])
    ])
  ]);

  assert.equal(extractLatexFromElement(katex).displayMode, true);
});

test("falls back to nearby math/tex scripts", () => {
  const wrapper = node("p", {}, [
    node("script", {
      attributes: { type: "math/tex; mode=display" },
      textContent: "a^2+b^2=c^2"
    }),
    node("span", { className: "katex" })
  ]);
  const katex = wrapper.children[1];

  assert.deepEqual(extractLatexFromElement(katex), {
    latex: "a^2+b^2=c^2",
    displayMode: true,
    source: "script"
  });
});

test("returns null when no reliable TeX source exists", () => {
  const katex = node("span", { className: "katex" }, [
    node("span", { className: "katex-html", textContent: "x" })
  ]);

  assert.equal(extractLatexFromElement(katex), null);
});

test("cleanLatex trims wrapper whitespace and removes zero-width chars", () => {
  assert.equal(cleanLatex(" \u200B\\frac{1}{2}\uFEFF "), "\\frac{1}{2}");
});
