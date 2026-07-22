# CopyTeX

An extension that copies KaTeX and MathJax-rendered formulas as Markdown or LaTeX on supported web pages.

## Preview

<p align="center">
  <img src="assets/hover.png" alt="CopyTeX hover copy button" width="760">
</p>

<p align="center"><sub>Hover copy control on a rendered formula.</sub></p>

<p align="center">
  <img src="assets/popup.png" alt="CopyTeX extension popup" width="320">
</p>

<p align="center"><sub>Extension popup for output format settings.</sub></p>

## Installation

This extension is only tested on Chrome.

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Build the extension:

   ```powershell
   npm run build
   ```

3. Open `chrome://extensions`.
4. Enable Developer mode.
5. Click `Load unpacked`.
6. Select the generated `dist/` folder.
7. Open or reload a supported site and test on a response containing rendered math.

To create a distributable zip, run:

```powershell
npm run package
```

The package is written to `release/copytex-v<version>.zip`.

## Supported Sites

- `https://chatgpt.com/`
- `https://chat.deepseek.com/`
- `https://www.zhihu.com/`
- `https://zhuanlan.zhihu.com/`
