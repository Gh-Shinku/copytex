const assert = require("node:assert/strict");
const test = require("node:test");
const extractor = require("../src/extractor");
const {
  formatFormulaForSelection,
  serializeSelectionToLatexText
} = require("../src/selection");

class NodeStub {
  constructor(tagName, options = {}) {
    this.tagName = tagName;
    this.nodeType = 1;
    this.className = options.className || "";
    this.attributes = options.attributes || {};
    this.textContent = options.textContent || "";
    this.nodeValue = null;
    this.children = [];
    this.childNodes = this.children;
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
      cursor = cursor.parentElement || cursor.parentNode;
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
      if (cursor.matches && cursor.matches(selector)) {
        return cursor;
      }
      cursor = cursor.parentElement || cursor.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const all = [];
    walk(this, (node) => {
      if (node.nodeType === 1) {
        all.push(node);
      }
    });

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

class TextStub {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.textContent = value;
    this.parentElement = null;
    this.parentNode = null;
    this.previousElementSibling = null;
    this.nextElementSibling = null;
  }
}

class RangeStub {
  constructor(root, options = {}) {
    this.commonAncestorContainer = root;
    this.startContainer = options.startContainer || root;
    this.startOffset = options.startOffset || 0;
    this.endContainer = options.endContainer || root;
    this.endOffset = options.endOffset || 0;
    this.collapsed = Boolean(options.collapsed);
  }

  intersectsNode(node) {
    return this.commonAncestorContainer === node || contains(this.commonAncestorContainer, node);
  }
}

function contains(parent, target) {
  if (!parent || !target) {
    return false;
  }

  if (parent.contains) {
    return parent.contains(target);
  }

  let cursor = target;
  while (cursor) {
    if (cursor === parent) {
      return true;
    }
    cursor = cursor.parentElement || cursor.parentNode;
  }

  return false;
}

function walk(node, visit) {
  for (const child of node.childNodes || []) {
    visit(child);
    walk(child, visit);
  }
}

function el(tagName, options, children = []) {
  return new NodeStub(tagName, options).append(...children);
}

function text(value) {
  return new TextStub(value);
}

function annotation(latex) {
  return el(
    "annotation",
    {
      attributes: { encoding: "application/x-tex" },
      textContent: latex
    },
    [text(latex)]
  );
}

function inlineFormula(latex) {
  return el("span", { className: "katex" }, [
    el("span", { className: "katex-mathml" }, [annotation(latex)]),
    el("span", { className: "katex-html" }, [text("rendered")])
  ]);
}

function displayFormula(latex) {
  return el("span", { className: "katex-display" }, [inlineFormula(latex)]);
}

function deepseekDisplayFormula(latex) {
  return el("span", { className: "ds-markdown-math ds-markdown-math-display" }, [
    inlineFormula(latex)
  ]);
}

function deepseekLabeledFormula(label, latex) {
  return el("div", { className: "ds-markdown ds-assistant-message-main-content" }, [
    el("p", { className: "ds-markdown-paragraph" }, [
      el("span", { textContent: label }, [text(label)]),
      inlineFormula(latex)
    ])
  ]);
}

function deepseekSentenceFormula(latex) {
  return el("div", { className: "ds-markdown ds-assistant-message-main-content" }, [
    el("p", { className: "ds-markdown-paragraph" }, [
      el("span", { textContent: "向上的力 " }, [text("向上的力 ")]),
      inlineFormula(latex),
      el("span", { textContent: " 作用在支点上" }, [text(" 作用在支点上")])
    ])
  ]);
}

function selectionForRange(range) {
  return {
    rangeCount: 1,
    getRangeAt(index) {
      assert.equal(index, 0);
      return range;
    }
  };
}

test("does not handle plain text selections", () => {
  const root = el("p", {}, [text("plain text only")]);
  const result = serializeSelectionToLatexText(selectionForRange(new RangeStub(root)), extractor);

  assert.deepEqual(result, { handled: false, text: "" });
});

test("wraps inline formulas with inline delimiters", () => {
  const root = inlineFormula("E = mc^2");
  const result = serializeSelectionToLatexText(selectionForRange(new RangeStub(root)), extractor);

  assert.deepEqual(result, {
    handled: true,
    text: "\\(E = mc^2\\)"
  });
});

test("wraps display formulas with display delimiters", () => {
  const root = displayFormula("\\int_0^1 x\\,dx");
  const result = serializeSelectionToLatexText(selectionForRange(new RangeStub(root)), extractor);

  assert.deepEqual(result, {
    handled: true,
    text: "\\[\\int_0^1 x\\,dx\\]"
  });
});

test("serializes mixed text and inline formulas in DOM order", () => {
  const root = el("p", {}, [text("Energy "), inlineFormula("E = mc^2"), text(" relation.")]);
  const result = serializeSelectionToLatexText(selectionForRange(new RangeStub(root)), extractor);

  assert.deepEqual(result, {
    handled: true,
    text: "Energy \\(E = mc^2\\) relation."
  });
});

test("serializes multiple formulas once each", () => {
  const root = el("p", {}, [
    inlineFormula("a+b"),
    text(" and "),
    inlineFormula("c+d")
  ]);
  const result = serializeSelectionToLatexText(selectionForRange(new RangeStub(root)), extractor);

  assert.deepEqual(result, {
    handled: true,
    text: "\\(a+b\\) and \\(c+d\\)"
  });
});

test("copies the whole formula when selection starts inside formula internals", () => {
  const formula = inlineFormula("\\frac{1}{2}");
  const innerText = formula.children[0].children[0].children[0];
  const range = new RangeStub(innerText, {
    startContainer: innerText,
    startOffset: 0,
    endContainer: innerText,
    endOffset: innerText.nodeValue.length
  });
  const result = serializeSelectionToLatexText(selectionForRange(range), extractor);

  assert.deepEqual(result, {
    handled: true,
    text: "\\(\\frac{1}{2}\\)"
  });
});

test("formats formulas using selected copy delimiters", () => {
  assert.equal(
    formatFormulaForSelection({ latex: "x", displayMode: false }),
    "\\(x\\)"
  );
  assert.equal(
    formatFormulaForSelection({ latex: "x", displayMode: true }),
    "\n\\[x\\]\n"
  );
  assert.equal(
    formatFormulaForSelection({ latex: "x", displayMode: true }, { displayDelimiter: "dollar" }),
    "\n$$x$$\n"
  );
});

test("serializes display formulas with dollar delimiters when configured", () => {
  const root = displayFormula("x^2");
  const result = serializeSelectionToLatexText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { displayDelimiter: "dollar" }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "$$x^2$$"
  });
});

test("serializes DeepSeek display formulas with dollar delimiters when configured", () => {
  const root = deepseekDisplayFormula("\\sum_{i=1}^n i");
  const result = serializeSelectionToLatexText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { displayDelimiter: "dollar" }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "$$\\sum_{i=1}^n i$$"
  });
});

test("serializes DeepSeek labeled formulas with dollar delimiters when configured", () => {
  const root = deepseekLabeledFormula("计算：", "18A = 1530");
  const result = serializeSelectionToLatexText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { displayDelimiter: "dollar" }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "计算：\n$$18A = 1530$$"
  });
});

test("keeps DeepSeek sentence formulas inline when configured with dollar display delimiters", () => {
  const root = deepseekSentenceFormula("A");
  const result = serializeSelectionToLatexText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { displayDelimiter: "dollar" }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "向上的力 \\(A\\) 作用在支点上"
  });
});
