---
name: image-to-text
description: "Extract text from an image or screenshot using OCR (tesseract). Useful for reading text from screenshots, copied images, or image files."
---

# Image-to-Text Skill (OCR)

Use this skill when the user asks to extract text from an image, screenshot, or clipboard image.

## Before Running

1. Confirm the input source:
   - image file path (preferred), or
   - clipboard image (if available in environment).
2. If the user did not provide an image path/source, ask for one.
3. Keep output focused: return extracted text and a short confidence/quality note.

## Steps

1. For image files:
   - run OCR with `tesseract <image> stdout`
2. For clipboard image flow (Linux, xclip):
   - copy clipboard PNG to temp file, OCR it, return text
3. Save key OCR notes with `write_file` if this is part of an ongoing pentest/report workflow.

## Example commands

- File OCR:
  - `tesseract /path/to/image.png stdout`
- Clipboard OCR (bash flow):
  - `xclip -selection clipboard -t image/png -o > /tmp/ocr.png && tesseract /tmp/ocr.png stdout`

## Safety

- Do not process unrelated local files without user request.
- Do not overwrite user files; use temp paths.
- If OCR tools are unavailable, report clearly and suggest installing required binaries.

## Completion

- Return:
  - extracted text (plain),
  - quality note (e.g. partial/clean),
  - any important caveats (blurred image, low contrast, missing language pack).

