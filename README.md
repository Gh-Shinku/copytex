# CopyTeX for ChatGPT

Chrome Manifest V3 extension that copies raw LaTeX source from KaTeX-rendered
formulas on ChatGPT.

## Features

- Hover a rendered formula and click `Copy TeX`.
- Right-click after pointing at a formula and choose `Copy LaTeX source`.
- Select text containing formulas and copy normally with `Ctrl+C` or a copy menu.
- Copies the raw formula body only, without adding `\(...\)` or `\[...\]`.
- Reads KaTeX MathML annotations first and avoids guessing from rendered HTML.
- Floating UI follows ChatGPT light and dark themes.

Selection copy is different from single-formula copy: formulas inside selected
text are wrapped as `\(...\)` or `\[...\]` so the pasted text remains renderable.
Use the extension popup to switch display formula wrappers between `\[...\]`
and `$$...$$`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select this repository folder.
5. Open or reload `https://chatgpt.com/` and test on a response containing rendered math.

## Development

Run the extractor tests:

```powershell
node --test tests/extractor.test.js
```

Run syntax checks:

```powershell
node --check src/extractor.js
node --check src/selection.js
node --check src/content.js
node --check src/background.js
```
