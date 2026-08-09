const assert = require("node:assert/strict");
const test = require("node:test");
const {
  COPYTEX_RESPONSE_COPY_ATTRIBUTE,
  injectResponseCopyButtons,
  isChatGptHost,
  serializeChatGptTurnToMarkdown
} = require("../.test-build/chatgpt.cjs");
const extractor = require("../.test-build/extractor.cjs");
const selectionSerializer = require("../.test-build/selection.cjs");

class ElementStub {
  constructor(tagName, attributes = {}, children = []) {
    this.tagName = tagName;
    this.nodeType = 1;
    this.attributes = { ...attributes };
    this.className = attributes.className || attributes.class || "";
    this.children = [];
    this.childNodes = this.children;
    this.parentElement = null;
    this.parentNode = null;
    this.listeners = {};
    this._textContent = attributes.textContent || "";

    for (const child of children) {
      this.append(child);
    }
  }

  append(child) {
    child.parentElement = this;
    child.parentNode = this;
    this.children.push(child);
    return this;
  }

  appendChild(child) {
    this.append(child);
    return child;
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

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  click() {
    if (this.listeners.click) {
      this.listeners.click({
        preventDefault() {},
        stopPropagation() {}
      });
    }
  }

  cloneNode(deep) {
    return new ElementStub(
      this.tagName,
      this.attributes,
      deep ? this.children.map((child) => child.cloneNode(true)) : []
    );
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

  getAttribute(name) {
    return this.attributes[name] || "";
  }

  get textContent() {
    return this._textContent || this.childNodes.map((child) => child.textContent || "").join("");
  }

  set textContent(value) {
    this._textContent = String(value || "");
  }

  insertAdjacentElement(position, element) {
    assert.equal(position, "afterend");
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    element.parentElement = this.parentElement;
    element.parentNode = this.parentElement;
    siblings.splice(index + 1, 0, element);
  }

  matches(selector) {
    if (selector === ".markdown") {
      return hasClass(this, "markdown");
    }

    if (selector === '[role="math"][data-math-source]') {
      return this.getAttribute("role") === "math" && Boolean(this.getAttribute("data-math-source"));
    }

    if (selector === '[data-client-katex-layout][data-math-source]') {
      return Boolean(this.getAttribute("data-math-source"));
    }

    const attributeMatch = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
    if (attributeMatch) {
      return this.getAttribute(attributeMatch[1]) === attributeMatch[2];
    }

    if (selector === '[data-message-author-role="assistant"] .markdown') {
      return hasClass(this, "markdown") && Boolean(this.closest('[data-message-author-role="assistant"]'));
    }

    if (selector === 'button[data-testid="copy-turn-action-button"]') {
      return (
        this.tagName.toLowerCase() === "button" &&
        this.getAttribute("data-testid") === "copy-turn-action-button"
      );
    }

    if (selector === 'section[data-testid^="conversation-turn-"][data-turn="assistant"]') {
      return (
        this.tagName.toLowerCase() === "section" &&
        this.getAttribute("data-testid").startsWith("conversation-turn-") &&
        this.getAttribute("data-turn") === "assistant"
      );
    }

    if (selector === 'section[data-testid^="conversation-turn-"]') {
      return (
        this.tagName.toLowerCase() === "section" &&
        this.getAttribute("data-testid").startsWith("conversation-turn-")
      );
    }

    if (selector === '[role="group"]') {
      return this.getAttribute("role") === "group";
    }

    if (selector.startsWith(".")) {
      return hasClass(this, selector.slice(1));
    }

    if (selector === ".katex-mathml annotation") {
      return this.matches("annotation") && Boolean(this.closest(".katex-mathml"));
    }

    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelectorAll(selector) {
    const matches = [];
    walk(this, (node) => {
      if (node.matches && node.matches(selector)) {
        matches.push(node);
      }
    });
    return matches;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") {
      this.className = String(value);
    }
  }
}

class TextStub {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.textContent = value;
    this.parentElement = null;
    this.parentNode = null;
  }

  cloneNode() {
    return new TextStub(this.nodeValue);
  }
}

function walk(node, visit) {
  for (const child of node.childNodes || []) {
    visit(child);
    walk(child, visit);
  }
}

function hasClass(node, className) {
  return String(node.className || "")
    .split(/\s+/)
    .includes(className);
}

function el(tagName, attributes, children = []) {
  return new ElementStub(tagName, attributes, children);
}

function text(value) {
  return new TextStub(value);
}

function turn(role) {
  return new ElementStub("section", {
    "data-testid": role === "assistant" ? "conversation-turn-1" : "conversation-turn-2",
    "data-turn": role
  }, [
    new ElementStub("div", {}, [
      new ElementStub("button", {
        "data-testid": "copy-turn-action-button",
        "aria-label": "Copy message",
        "data-state": "closed"
      })
    ])
  ]);
}

function assistantTurnWithMarkdown(children) {
  return el("section", {
    "data-testid": "conversation-turn-1",
    "data-turn": "assistant"
  }, [
    el("div", { "data-message-author-role": "assistant" }, [
      el("div", { className: "markdown prose" }, children)
    ])
  ]);
}

function latestAssistantTurnWithMarkdown(children) {
  return el("section", {
    "data-testid": "conversation-turn-1"
  }, [
    el("div", { "data-message-author-role": "assistant" }, [
      el("div", { className: "markdown prose" }, children)
    ]),
    el("div", { role: "group" }, [
      el("button", {
        "data-testid": "copy-turn-action-button",
        "aria-label": "Copy response",
        "data-state": "closed"
      })
    ])
  ]);
}

function inlineFormula(latex) {
  return el("span", { className: "katex" }, [
    el("span", { className: "katex-mathml" }, [
      el("annotation", {
        encoding: "application/x-tex",
        textContent: latex
      }, [text(latex)])
    ]),
    el("span", { className: "katex-html" }, [text("rendered")])
  ]);
}

function displayFormula(latex) {
  return el("span", { className: "katex-display" }, [inlineFormula(latex)]);
}

function chatGptMathSourceFormula(latex, displayMode = false) {
  const katex = el("span", { className: "katex" }, [
    el("span", { className: "katex-html", "aria-hidden": "true" }, [text("rendered")])
  ]);
  const content = displayMode
    ? [el("span", { className: "katex-display" }, [katex])]
    : [katex];

  return el("span", {
    role: "math",
    "data-math-source": latex,
    "data-client-katex-layout": "",
    style: displayMode ? "display:block" : ""
  }, content);
}

test("detects ChatGPT hosts", () => {
  assert.equal(isChatGptHost("chatgpt.com"), true);
  assert.equal(isChatGptHost("chat.openai.com"), true);
  assert.equal(isChatGptHost("chat.deepseek.com"), false);
});

test("injects response copy buttons into assistant turns only", () => {
  const root = new ElementStub("main", {}, [turn("assistant"), turn("user")]);

  assert.equal(injectResponseCopyButtons(root, () => {}), 1);
  assert.equal(root.querySelectorAll(`[${COPYTEX_RESPONSE_COPY_ATTRIBUTE}="true"]`).length, 1);

  const assistantActions = root.children[0].children[0].children;
  const userActions = root.children[1].children[0].children;
  assert.equal(assistantActions.length, 2);
  assert.equal(userActions.length, 1);
  assert.equal(assistantActions[1].getAttribute(COPYTEX_RESPONSE_COPY_ATTRIBUTE), "true");
  assert.equal(assistantActions[1].getAttribute("data-testid"), "");
  assert.equal(assistantActions[1].getAttribute("aria-label"), "Copy message with CopyTeX");
  assert.match(assistantActions[1].innerHTML, /TeX/);
});

test("does not inject duplicate response copy buttons", () => {
  const root = new ElementStub("main", {}, [turn("assistant")]);

  assert.equal(injectResponseCopyButtons(root, () => {}), 1);
  assert.equal(injectResponseCopyButtons(root, () => {}), 0);
  assert.equal(root.children[0].children[0].children.length, 2);
});

test("injects response copy buttons into latest ChatGPT assistant turns without data-turn", () => {
  const root = new ElementStub("main", {}, [
    latestAssistantTurnWithMarkdown([el("p", {}, [text("Assistant")])])
  ]);

  assert.equal(injectResponseCopyButtons(root, () => {}), 1);
  assert.equal(root.querySelectorAll(`[${COPYTEX_RESPONSE_COPY_ATTRIBUTE}="true"]`).length, 1);
});

test("reinjects response copy buttons when native marker remains but CopyTeX button is missing", () => {
  const root = new ElementStub("main", {}, [turn("assistant")]);
  const nativeButton = root.children[0].children[0].children[0];
  nativeButton.setAttribute("data-copytex-response-copy-injected", "true");

  assert.equal(injectResponseCopyButtons(root, () => {}), 1);
  assert.equal(root.querySelectorAll(`[${COPYTEX_RESPONSE_COPY_ATTRIBUTE}="true"]`).length, 1);
});

test("response copy button calls handler without clicking the native button", () => {
  const root = new ElementStub("main", {}, [turn("assistant")]);
  let calledWith = null;
  let nativeClicked = false;

  injectResponseCopyButtons(root, (nativeButton) => {
    calledWith = nativeButton;
  });

  const nativeButton = root.children[0].children[0].children[0];
  nativeButton.addEventListener("click", () => {
    nativeClicked = true;
  });
  const copyTeXButton = root.children[0].children[0].children[1];
  copyTeXButton.click();

  assert.equal(calledWith, nativeButton);
  assert.equal(nativeClicked, false);
});

test("serializes common ChatGPT Markdown DOM", () => {
  const turnNode = assistantTurnWithMarkdown([
    el("h2", {}, [text("Heading")]),
    el("p", {}, [
      el("strong", {}, [text("Bold")]),
      text(" and "),
      el("em", {}, [text("em")]),
      text(" with "),
      el("a", { href: "https://example.com" }, [text("link")]),
      text(" and "),
      el("code", {}, [text("x = 1")])
    ]),
    el("ul", {}, [
      el("li", {}, [text("first")]),
      el("li", {}, [text("second")])
    ]),
    el("blockquote", {}, [
      el("p", {}, [text("quoted")])
    ]),
    el("pre", {}, [
      el("code", { className: "language-js" }, [text("const x = '$5';")])
    ]),
    el("hr")
  ]);

  const result = serializeChatGptTurnToMarkdown(
    turnNode,
    extractor,
    selectionSerializer
  );

  assert.deepEqual(result, {
    ok: true,
    text: [
      "## Heading",
      "",
      "**Bold** and *em* with [link](https://example.com) and `x = 1`",
      "",
      "- first",
      "- second",
      "",
      "> quoted",
      "",
      "```js",
      "const x = '$5';",
      "```",
      "",
      "---"
    ].join("\n")
  });
});

test("serializes ChatGPT KaTeX formulas using Markdown output", () => {
  const turnNode = assistantTurnWithMarkdown([
    el("p", {}, [
      text("Inline "),
      inlineFormula("E = mc^2"),
      text(".")
    ]),
    displayFormula("\\int_0^1 x\\,dx")
  ]);

  const result = serializeChatGptTurnToMarkdown(turnNode, extractor, selectionSerializer);

  assert.deepEqual(result, {
    ok: true,
    text: "Inline $E = mc^2$.\n\n$$\n\\int_0^1 x\\,dx\n$$"
  });
});

test("serializes latest ChatGPT data-math-source formulas using Markdown output", () => {
  const turnNode = latestAssistantTurnWithMarkdown([
    el("p", {}, [
      text("Score "),
      chatGptMathSourceFormula("r_\\theta(x,y)"),
      text(".")
    ]),
    chatGptMathSourceFormula("L=-\\log\\sigma(r_\\theta(x,y_w)-r_\\theta(x,y_l))", true)
  ]);

  const result = serializeChatGptTurnToMarkdown(turnNode, extractor, selectionSerializer);

  assert.deepEqual(result, {
    ok: true,
    text:
      "Score $r_\\theta(x,y)$.\n\n" +
      "$$\nL=-\\log\\sigma(r_\\theta(x,y_w)-r_\\theta(x,y_l))\n$$"
  });
});

test("serializes ChatGPT KaTeX formulas using LaTeX output", () => {
  const turnNode = assistantTurnWithMarkdown([
    el("p", {}, [
      text("Inline "),
      inlineFormula("E = mc^2"),
      text(".")
    ]),
    displayFormula("\\int_0^1 x\\,dx")
  ]);

  const result = serializeChatGptTurnToMarkdown(
    turnNode,
    extractor,
    selectionSerializer,
    { outputFormat: "latex" }
  );

  assert.deepEqual(result, {
    ok: true,
    text: "Inline \\(E = mc^2\\).\n\n\\[\n\\int_0^1 x\\,dx\n\\]"
  });
});

test("serializes tables", () => {
  const turnNode = assistantTurnWithMarkdown([
    el("table", {}, [
      el("tr", {}, [el("th", {}, [text("A")]), el("th", {}, [text("B")])]),
      el("tr", {}, [el("td", {}, [text("1")]), el("td", {}, [text("2")])])
    ])
  ]);

  const result = serializeChatGptTurnToMarkdown(turnNode, extractor, selectionSerializer);

  assert.deepEqual(result, {
    ok: true,
    text: "| A | B |\n| --- | --- |\n| 1 | 2 |"
  });
});

test("reports missing ChatGPT response content", () => {
  const result = serializeChatGptTurnToMarkdown(turn("assistant"), extractor, selectionSerializer);

  assert.deepEqual(result, {
    ok: false,
    text: "",
    error: "No response content found"
  });
});
