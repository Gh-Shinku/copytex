const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const popupScript = fs.readFileSync("src/popup.js", "utf8");

function runPopup(storedValue) {
  const setCalls = [];
  const statusElement = { textContent: "" };
  const inputs = [
    createInput("markdown"),
    createInput("latex")
  ];

  const sandbox = {
    chrome: {
      storage: {
        sync: {
          get(defaults, callback) {
            const key = Object.keys(defaults)[0];
            callback({ [key]: storedValue === undefined ? defaults[key] : storedValue });
          },
          set(items, callback) {
            setCalls.push(items);
            if (callback) {
              callback();
            }
          }
        }
      }
    },
    document: {
      getElementById(id) {
        return id === "status" ? statusElement : null;
      },
      querySelectorAll(selector) {
        return selector === 'input[name="outputFormat"]' ? inputs : [];
      }
    },
    window: {
      setTimeout(callback) {
        callback();
      }
    }
  };

  vm.runInNewContext(popupScript, sandbox);

  return { inputs, setCalls, statusElement };
}

function createInput(value) {
  const listeners = {};

  return {
    checked: false,
    value,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    dispatch(type) {
      listeners[type]();
    }
  };
}

test("popup defaults to Markdown output", () => {
  const { inputs } = runPopup();

  assert.equal(inputs[0].checked, true);
  assert.equal(inputs[1].checked, false);
});

test("popup reads stored LaTeX output format", () => {
  const { inputs } = runPopup("latex");

  assert.equal(inputs[0].checked, false);
  assert.equal(inputs[1].checked, true);
});

test("popup saves selected output format", () => {
  const { inputs, setCalls } = runPopup();

  inputs[1].checked = true;
  inputs[1].dispatch("change");

  assert.equal(setCalls.length, 1);
  assert.equal(setCalls[0].outputFormat, "latex");
});

test("popup falls back to Markdown for invalid stored values", () => {
  const { inputs } = runPopup("dollar");

  assert.equal(inputs[0].checked, true);
  assert.equal(inputs[1].checked, false);
});
