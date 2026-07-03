# exam-ink-extractor

Extract the handwritten regions from a filled exam, given the blank exam PDF.
Language-agnostic (no OCR): works for any script, math, drawings, check-marks —
dense or sparse. See [RESEARCH.md](RESEARCH.md) for the method and its rationale.

## Install

```bash
pip install -r requirements.txt
```

## Use

```bash
python -m exam_ink blank.pdf filled_scan.pdf -o out/
```

- `filled_scan.pdf` can be a scanned/photographed PDF (CamScanner, iOS scan)
  or a plain image file. Digitally-filled PDFs (stylus/PDF editor) take a
  lossless fast path via the annotation layer.
- Pages are paired automatically — scans may be out of order or a subset.
- `--peer other_students_copy.pdf` (repeatable): if you have more filled
  copies of the same exam, they are used for consensus filtering of print
  artifacts that differ between the paper and the blank PDF. Recommended
  whenever available.
- `--debug` writes per-page intermediates (aligned scan, ink maps,
  handwriting mask, red overlay) for inspection.

Output, per input page:

```
out/
  page_01/
    Q6.png, Q6A.png, ...  # one crop per (sub)question: the question's zone
                          # containing that question's entire handwritten answer
    region_01.png         # raw handwriting-region crop (feed this to HTR)
    region_01_ink.png     # same crop, handwriting ink only, white background
    ...
  regions.json            # page pairing, per-region + per-question bboxes
                          # (px + PDF points), question labels, ink area,
                          # alignment quality and low_confidence flags
```

Question zones (`Q6`, `Q6A`…) are read from the blank PDF's **text layer**:
question numbers (1, 2, 3…) and sub-question letters (a, b… / א, ב…) are
detected by position + sequence validation — script-agnostic, no OCR. Each
crop spans its question's band and never reaches into the next question,
except when the student's ink itself overflows (the whole answer always wins).
If the blank PDF has no text layer (e.g. it is itself a scan), question
grouping is skipped and only `region_*.png` crops are produced.

Pages whose alignment quality is poor are marked `"low_confidence": true` in
`regions.json` with the reasons — review those instead of trusting them blindly.

## Sending the answers to an LLM

The `Q*.png` crops are the right unit to feed a vision LLM: each one is a
self-contained image with the printed (sub)question and the student's whole
handwritten answer. `examples/send_to_llm.py` walks `regions.json`, sends each
question crop to Claude, and writes `answers.json` mapping `Q6A → transcribed
answer` (structured output, works for any language / marks / drawings):

```bash
pip install anthropic
export ANTHROPIC_API_KEY=...
python examples/send_to_llm.py out/
```

## Test

```bash
python -m pytest tests/
```

The end-to-end test synthesizes an exam PDF, overlays known handwriting,
simulates a phone-camera capture (perspective, paper bend, lighting, JPEG),
and asserts every region is recovered with bounded false positives.
