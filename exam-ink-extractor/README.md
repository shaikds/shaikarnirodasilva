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
    region_01.png        # crop of the registered scan (feed this to HTR)
    region_01_ink.png    # same crop, handwriting ink only, white background
    ...
  regions.json           # page pairing, bboxes (px + PDF points), ink area,
                         # alignment quality and low_confidence flags
```

Pages whose alignment quality is poor are marked `"low_confidence": true` in
`regions.json` with the reasons — review those instead of trusting them blindly.

## Test

```bash
python -m pytest tests/
```

The end-to-end test synthesizes an exam PDF, overlays known handwriting,
simulates a phone-camera capture (perspective, paper bend, lighting, JPEG),
and asserts every region is recovered with bounded false positives.
