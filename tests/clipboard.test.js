const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const clipboardScript = fs.readFileSync("src/content/clipboard.js", "utf8");

function loadClipboard(sandbox) {
  vm.runInNewContext(clipboardScript, sandbox);
  return sandbox.CopyTeXClipboard;
}

test("clipboard writes with navigator clipboard when available", async () => {
  const writes = [];
  const clipboard = loadClipboard({
    navigator: {
      clipboard: {
        async writeText(text) {
          writes.push(text);
        }
      }
    }
  });

  await clipboard.writeText("x^2");

  assert.deepEqual(writes, ["x^2"]);
});

test("clipboard falls back to textarea copy when navigator clipboard fails", async () => {
  let appended = null;
  let selected = false;
  let selectionRange = null;
  let removed = false;
  const clipboard = loadClipboard({
    navigator: {
      clipboard: {
        async writeText() {
          throw new Error("blocked");
        }
      }
    },
    document: {
      body: {
        appendChild(element) {
          appended = element;
        }
      },
      createElement(tagName) {
        assert.equal(tagName, "textarea");
        return {
          style: {},
          value: "",
          setAttribute(name, value) {
            this[name] = value;
          },
          select() {
            selected = true;
          },
          setSelectionRange(start, end) {
            selectionRange = [start, end];
          },
          remove() {
            removed = true;
          }
        };
      },
      execCommand(command) {
        assert.equal(command, "copy");
        return true;
      }
    }
  });

  await clipboard.writeText("a+b");

  assert.equal(appended.value, "a+b");
  assert.equal(selected, true);
  assert.deepEqual(selectionRange, [0, 3]);
  assert.equal(removed, true);
});
