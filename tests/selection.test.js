const assert = require("node:assert/strict");
const test = require("node:test");
const extractor = require("../.test-build/extractor.cjs");
const {
  formatFormula,
  formatFormulaForSelection,
  normalizeOptions,
  serializeSelectionToMarkdownText,
  serializeSelectionToLatexText
} = require("../.test-build/selection.cjs");

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

    if (/^[a-z][a-z0-9-]*$/i.test(selector)) {
      return all.filter((node) => node.matches(selector));
    }

    if (selector === ".katex-mathml annotation") {
      return all.filter(
        (node) => node.matches("annotation") && Boolean(node.closest(".katex-mathml"))
      );
    }

    if (selector.startsWith(".")) {
      return all.filter((node) => node.matches(selector));
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

class FragmentStub {
  constructor(children = []) {
    this.nodeType = 11;
    this.childNodes = [];
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.append(...children);
  }

  append(...children) {
    for (const child of children) {
      const previous = this.childNodes[this.childNodes.length - 1] || null;
      if (previous) {
        previous.nextElementSibling = child;
        child.previousElementSibling = previous;
      }

      child.parentElement = null;
      child.parentNode = this;
      this.childNodes.push(child);
      if (child.nodeType === 1) {
        this.children.push(child);
      }
    }
    return this;
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
    this.clonedContents = options.clonedContents || null;
  }

  intersectsNode(node) {
    return this.commonAncestorContainer === node || contains(this.commonAncestorContainer, node);
  }

  cloneContents() {
    return this.clonedContents || this.commonAncestorContainer;
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

function strong(children) {
  return el("strong", {}, children);
}

function anchor(href, children) {
  return el("a", { attributes: { href } }, children);
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

function zhihuFormula(latex, displayMode = false) {
  return el("span", {
    className: "ztext-math",
    attributes: {
      "data-eeimg": displayMode ? "2" : "1",
      "data-tex": latex
    }
  }, [
    el("span", { className: "MathJax_SVG" }, [text("rendered")])
  ]);
}

function zhihuMathJaxDisplayFormula(latex) {
  return el("span", {
    className: "ztext-math",
    attributes: {
      "data-eeimg": "1",
      "data-tex": latex
    }
  }, [
    el("span", {}, [
      el("span", { className: "MathJax_SVG_Display" }, [
        el("span", { className: "MathJax_SVG" }, [text("rendered")])
      ])
    ])
  ]);
}

function mediaWikiFormula(latex, options = {}) {
  const wrapped = `{\\displaystyle ${latex}}`;
  return el("span", {
    className: options.className || "mwe-math-element mwe-math-element-inline"
  }, [
    el("span", { className: "mwe-math-mathml-inline" }, [
      el("math", { attributes: { alttext: wrapped } }, [
        annotation(wrapped)
      ])
    ]),
    el("img", {
      className: "mwe-math-fallback-image-inline mw-invert skin-invert",
      attributes: {
        alt: wrapped,
        "aria-hidden": "true"
      }
    })
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
    text: "$E = mc^2$"
  });
});

test("wraps display formulas with display delimiters", () => {
  const root = displayFormula("\\int_0^1 x\\,dx");
  const result = serializeSelectionToLatexText(selectionForRange(new RangeStub(root)), extractor);

  assert.deepEqual(result, {
    handled: true,
    text: "$$\n\\int_0^1 x\\,dx\n$$"
  });
});

test("serializes mixed text and inline formulas in DOM order", () => {
  const root = el("p", {}, [text("Energy "), inlineFormula("E = mc^2"), text(" relation.")]);
  const result = serializeSelectionToLatexText(selectionForRange(new RangeStub(root)), extractor);

  assert.deepEqual(result, {
    handled: true,
    text: "Energy $E = mc^2$ relation."
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
    text: "$a+b$ and $c+d$"
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
    text: "$\\frac{1}{2}$"
  });
});

test("formats formulas using selected output format", () => {
  assert.equal(
    formatFormulaForSelection({ latex: "x", displayMode: false }),
    "$x$"
  );
  assert.equal(
    formatFormulaForSelection({ latex: "x", displayMode: true }),
    "\n$$\nx\n$$\n"
  );
  assert.equal(
    formatFormulaForSelection({ latex: "x", displayMode: false }, { outputFormat: "latex" }),
    "\\(x\\)"
  );
  assert.equal(
    formatFormulaForSelection({ latex: "x", displayMode: true }, { outputFormat: "latex" }),
    "\n\\[\nx\n\\]\n"
  );
});

test("formats single formulas through the shared formatter", () => {
  assert.equal(formatFormula({ latex: "x+1", displayMode: false }), "$x+1$");
  assert.equal(formatFormula({ latex: "x+1", displayMode: true }), "$$\nx+1\n$$");
  assert.equal(
    formatFormula({ latex: "x+1", displayMode: true }, { outputFormat: "latex" }),
    "\\[\nx+1\n\\]"
  );
});

test("normalizes invalid output format to Markdown", () => {
  assert.deepEqual(normalizeOptions({ outputFormat: "unknown" }), {
    outputFormat: "markdown"
  });
});

test("serializes display formulas as LaTeX when configured", () => {
  const root = displayFormula("x^2");
  const result = serializeSelectionToLatexText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { outputFormat: "latex" }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "\\[\nx^2\n\\]"
  });
});

test("serializes DeepSeek display formulas with Markdown delimiters by default", () => {
  const root = deepseekDisplayFormula("\\sum_{i=1}^n i");
  const result = serializeSelectionToLatexText(
    selectionForRange(new RangeStub(root)),
    extractor
  );

  assert.deepEqual(result, {
    handled: true,
    text: "$$\n\\sum_{i=1}^n i\n$$"
  });
});

test("serializes DeepSeek labeled formulas with Markdown delimiters by default", () => {
  const root = deepseekLabeledFormula("计算：", "18A = 1530");
  const result = serializeSelectionToLatexText(
    selectionForRange(new RangeStub(root)),
    extractor
  );

  assert.deepEqual(result, {
    handled: true,
    text: "计算：\n$$\n18A = 1530\n$$"
  });
});

test("keeps DeepSeek sentence formulas inline in Markdown mode", () => {
  const root = deepseekSentenceFormula("A");
  const result = serializeSelectionToLatexText(
    selectionForRange(new RangeStub(root)),
    extractor
  );

  assert.deepEqual(result, {
    handled: true,
    text: "向上的力 $A$ 作用在支点上"
  });
});

test("serializes Zhihu inline MathJax formulas from data-tex", () => {
  const root = el("p", {}, [
    text("Adam 在 "),
    zhihuFormula("\\beta_1=\\beta_2"),
    text(" 时表现更优。")
  ]);
  const result = serializeSelectionToLatexText(selectionForRange(new RangeStub(root)), extractor);

  assert.deepEqual(result, {
    handled: true,
    text: "Adam 在 $\\beta_1=\\beta_2$ 时表现更优。"
  });
});

test("serializes Zhihu display MathJax formulas with Markdown delimiters by default", () => {
  const root = zhihuFormula("\\int_0^1 x\\,dx", true);
  const result = serializeSelectionToLatexText(
    selectionForRange(new RangeStub(root)),
    extractor
  );

  assert.deepEqual(result, {
    handled: true,
    text: "$$\n\\int_0^1 x\\,dx\n$$"
  });
});

test("serializes Zhihu MathJax display wrappers with Markdown delimiters by default", () => {
  const root = zhihuMathJaxDisplayFormula("\\sum_{k=1}^n k");
  const result = serializeSelectionToLatexText(
    selectionForRange(new RangeStub(root)),
    extractor
  );

  assert.deepEqual(result, {
    handled: true,
    text: "$$\n\\sum_{k=1}^n k\n$$"
  });
});

test("serializes Wikipedia article text as Markdown", () => {
  const editSection = el("span", { className: "mw-editsection" }, [text("[编辑]")]);
  const reference = el("sup", { className: "reference" }, [text("[1]")]);
  const root = el("div", { className: "mw-parser-output" }, [
    el("div", { className: "mw-heading mw-heading2" }, [
      el("h2", {}, [text("实例说明")]),
      editSection
    ]),
    el("p", {}, [
      text("给定点"),
      strong([text("P")]),
      el("sub", {}, [text("0")]),
      text("和"),
      anchor("https://zh.wikipedia.org/wiki/%E7%9B%B4%E7%B7%9A", [text("直线")]),
      text("。"),
      reference
    ])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "## 实例说明\n\n给定点**P**<sub>0</sub>和[直线](https://zh.wikipedia.org/wiki/%E7%9B%B4%E7%B7%9A)。"
  });
});

test("serializes Wikipedia relative links as absolute Markdown links", () => {
  const root = el("p", {}, [
    anchor("/wiki/%E6%9B%B2%E7%BA%BF", [text("曲线")]),
    text("、"),
    anchor("#定义", [text("定义")]),
    text("、"),
    anchor("./Bernstein_polynomial", [text("Bernstein")]),
    text("、"),
    anchor("//upload.wikimedia.org/wikipedia/commons/a/a5/Example.svg", [text("图片")]),
    text("、"),
    anchor("https://en.wikipedia.org/wiki/B%C3%A9zier_curve", [text("English")])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula },
    { baseUrl: "https://zh.wikipedia.org/wiki/%E8%B4%9D%E5%A1%9E%E5%B0%94%E6%9B%B2%E7%BA%BF" }
  );

  assert.deepEqual(result, {
    handled: true,
    text:
      "[曲线](https://zh.wikipedia.org/wiki/%E6%9B%B2%E7%BA%BF)、" +
      "[定义](https://zh.wikipedia.org/wiki/%E8%B4%9D%E5%A1%9E%E5%B0%94%E6%9B%B2%E7%BA%BF#%E5%AE%9A%E4%B9%89)、" +
      "[Bernstein](https://zh.wikipedia.org/wiki/Bernstein_polynomial)、" +
      "[图片](https://upload.wikimedia.org/wikipedia/commons/a/a5/Example.svg)、" +
      "[English](https://en.wikipedia.org/wiki/B%C3%A9zier_curve)"
  });
});

test("serializes partial Wikipedia paragraph fragments as Markdown with absolute links", () => {
  const fragment = new FragmentStub([
    text("有时我们可能想要把贝塞尔曲线表示为"),
    anchor("/wiki/%E5%A4%9A%E9%A0%85%E5%BC%8F", [text("多项式")]),
    text("，而非比较不直接的"),
    anchor(
      "/w/index.php?title=%E4%BC%AF%E6%81%A9%E6%96%AF%E5%9D%A6%E5%A4%9A%E9%A0%85%E5%BC%8F&action=edit&redlink=1",
      [text("伯恩斯坦多项式")]
    ),
    text("。使用"),
    anchor("/wiki/%E4%BA%8C%E9%A1%B9%E5%BC%8F%E5%AE%9A%E7%90%86", [text("二项式定理")]),
    text("和贝塞尔曲线的定义，刷新后可以得到：")
  ]);
  const article = el("div", { className: "mw-parser-output" }, [
    el("p", {}, [
      text("有时我们可能想要把贝塞尔曲线表示为"),
      anchor("/wiki/%E5%A4%9A%E9%A0%85%E5%BC%8F", [text("多项式")])
    ])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(article, { clonedContents: fragment })),
    extractor,
    { formatFormula },
    { baseUrl: "https://zh.wikipedia.org/wiki/%E8%B2%9D%E8%8C%B2%E6%9B%B2%E7%B7%9A" }
  );

  assert.deepEqual(result, {
    handled: true,
    text:
      "有时我们可能想要把贝塞尔曲线表示为" +
      "[多项式](https://zh.wikipedia.org/wiki/%E5%A4%9A%E9%A0%85%E5%BC%8F)，而非比较不直接的" +
      "[伯恩斯坦多项式](https://zh.wikipedia.org/w/index.php?title=%E4%BC%AF%E6%81%A9%E6%96%AF%E5%9D%A6%E5%A4%9A%E9%A0%85%E5%BC%8F&action=edit&redlink=1)。使用" +
      "[二项式定理](https://zh.wikipedia.org/wiki/%E4%BA%8C%E9%A1%B9%E5%BC%8F%E5%AE%9A%E7%90%86)" +
      "和贝塞尔曲线的定义，刷新后可以得到："
  });
});

test("serializes dangerous Wikipedia links as plain text", () => {
  const root = el("p", {}, [
    anchor("javascript:void(0)", [text("伪链接")])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula },
    { baseUrl: "https://zh.wikipedia.org/wiki/Test" }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "伪链接"
  });
});

test("serializes Wikipedia definition-list formulas as display Markdown", () => {
  const root = el("dl", {}, [
    el("dd", {}, [mediaWikiFormula("\\mathbf {B} (t)=\\mathbf {P} _{0}+t")])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "$$\n\\mathbf {B} (t)=\\mathbf {P} _{0}+t\n$$"
  });
});

test("serializes Wikipedia code blocks with MediaWiki language classes", () => {
  const root = el("div", { className: "mw-highlight mw-highlight-lang-c mw-content-ltr" }, [
    el("pre", { textContent: "int main(void) {\n  return 0;\n}" }, [
      text("int main(void) {\n  return 0;\n}")
    ])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "```c\nint main(void) {\n  return 0;\n}\n```"
  });
});

test("serializes Wikipedia figures as text-first captions", () => {
  const root = el("figure", { attributes: { typeof: "mw:File/Thumb" } }, [
    el("img", {
      className: "mw-file-element",
      attributes: {
        src: "./local/Wikipedia_files/Bezier_curve.svg.png",
        alt: "Bezier curve"
      }
    }),
    el("figcaption", {}, [text("三次方贝塞尔曲线")])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "三次方贝塞尔曲线"
  });
});

test("serializes Zhihu rich text selections as Markdown without requiring formulas", () => {
  const root = el("div", { className: "RichText ztext Post-RichText" }, [
    el("h2", {}, [text("优化器")]),
    el("p", {}, [
      strong([text("Adam")]),
      text(" 参考 "),
      anchor("https://example.com/paper", [text("论文")])
    ])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "## 优化器\n\n**Adam** 参考 [论文](https://example.com/paper)"
  });
});

test("unwraps Zhihu outbound redirect links", () => {
  const target =
    "https://www.microsoft.com/en-us/research/blog/deepspeed-extreme-scale-model-training-for-everyone/";
  const root = el("div", { className: "RichText ztext Post-RichText" }, [
    el("p", {}, [
      anchor(`https://link.zhihu.com/?target=${encodeURIComponent(target)}`, [
        text("DeepSpeed")
      ])
    ])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: `[DeepSpeed](${target})`
  });
});

test("unwraps protocol-relative Zhihu outbound redirect links", () => {
  const root = el("div", { className: "RichText ztext Post-RichText" }, [
    el("p", {}, [
      anchor("//link.zhihu.com/?target=https%3A%2F%2Fexample.com%2Fpaper", [
        text("论文")
      ])
    ])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "[论文](https://example.com/paper)"
  });
});

test("keeps Zhihu outbound redirect links without targets", () => {
  const href = "https://link.zhihu.com/?utm_source=zhihu";
  const root = el("div", { className: "RichText ztext Post-RichText" }, [
    el("p", {}, [anchor(href, [text("空跳转")])])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: `[空跳转](${href})`
  });
});

test("serializes Zhihu auto entity links as plain text", () => {
  const root = el("div", { className: "RichText ztext Post-RichText" }, [
    el("p", {}, [
      text("使用 "),
      anchor("https://zhida.zhihu.com/search?q=%E8%BF%91%E4%BC%BC%E5%88%86%E6%9E%90", [
        text("近似分析")
      ]),
      text(" 处理。")
    ])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "使用 近似分析 处理。"
  });
});

test("serializes Zhihu entity-word class links as plain text", () => {
  const entityLink = anchor("https://www.zhihu.com/search?q=LLM", [text("LLM")]);
  entityLink.className = "RichContent-EntityWord css-b7erz1";
  const root = el("div", { className: "RichText ztext Post-RichText" }, [
    el("p", {}, [entityLink])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "LLM"
  });
});

test("serializes Zhihu entity links mixed with formulas", () => {
  const root = el("div", { className: "RichText ztext Post-RichText" }, [
    el("p", {}, [
      anchor("//zhida.zhihu.com/search?q=x", [text("近似分析")]),
      text(" 中 "),
      zhihuFormula("x"),
      text(" 成立。")
    ])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "近似分析 中 $x$ 成立。"
  });
});

test("serializes Zhihu rich text selections with MathJax formula source", () => {
  const root = el("div", { className: "RichText ztext Post-RichText" }, [
    el("p", {}, [
      text("当 "),
      zhihuFormula("\\beta_1=\\beta_2"),
      text(" 时成立。")
    ])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "当 $\\beta_1=\\beta_2$ 时成立。"
  });
});

test("serializes Zhihu rich text formulas using LaTeX delimiters when configured", () => {
  const root = el("div", { className: "RichText ztext Post-RichText" }, [
    el("p", {}, [
      text("当 "),
      zhihuFormula("\\beta_1=\\beta_2"),
      text(" 时成立。")
    ])
  ]);
  const result = serializeSelectionToMarkdownText(
    selectionForRange(new RangeStub(root)),
    extractor,
    { formatFormula },
    { outputFormat: "latex" }
  );

  assert.deepEqual(result, {
    handled: true,
    text: "当 \\(\\beta_1=\\beta_2\\) 时成立。"
  });
});
