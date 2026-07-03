# Extracting Handwritten Regions from Filled Exams — Research Notes

## Problem

Given (1) a blank exam PDF and (2) the same exam filled in by hand and captured
with a phone camera (CamScanner / iOS document scan), locate exactly where the
handwritten content is and emit tight, low-noise crops of each handwritten
region. Handwriting may be text in **any language or script**, math, shapes,
diagrams, check-marks — dense or sparse. No OCR, no script-specific model.

## Core insight: form dropout

Most handwriting-detection work tries to *recognize* handwriting. We don't
need to: we have the ground truth of what the page looked like before anyone
wrote on it. Register the filled scan onto the blank template, subtract the
template's ink, and whatever remains is handwriting. This technique — **form
dropout / template elimination** — has been used industrially in forms
processing for decades and is language-agnostic *by construction*: it is pure
geometry and photometry.

Machine-learning separators of handwritten vs. printed text (HPSegNet-style
U-Nets, end-to-end CNN segmentation) exist, but they are trained on specific
scripts and document styles and struggle with drawings, shapes and formulas.
When a template is available, subtraction is strictly more reliable. ML is the
right *fallback* for the no-template case only.

## What "100% reliable" means, honestly

- **Digitally filled PDFs** (tablet/stylus/PDF editor): the ink lives in a
  separate annotation layer inside the PDF. It can be extracted losslessly —
  the only truly 100% case. The pipeline detects this and takes a fast path
  (`ingest.py`, annotation types Ink/FreeText/Line/…).
- **Camera scans**: perspective, paper bend, lighting and CamScanner's
  filters make alignment approximate. The correct engineering target is
  *bounded error plus knowing when you're outside the bound*: every stage
  reports a quality metric and pages that can't be aligned confidently are
  flagged `low_confidence` instead of silently producing garbage.

## Pipeline

```
blank.pdf ──rasterize──▶ template pages ─────────────┐
filled.pdf ─rasterize──▶ scan pages ──page pairing──▶ registration ─▶ dropout ─▶ regions ─▶ crops
                                                      (3 stages)      (4 filters)
```

1. **Rasterize** (`ingest.py`) — both documents to grayscale at 300 DPI via
   PyMuPDF. The blank PDF renders vector-perfect: its ink map is exact.
2. **Page pairing** (`pagematch.py`) — scans arrive out of order / as single
   pages. ORB descriptor scores + Hungarian assignment pick the right template
   page for each scan.
3. **Registration** (`register.py`) — the reliability core, three stages:
   - *Coarse*: SIFT keypoints, Lowe ratio test, RANSAC homography.
   - *Fine*: ECC (`findTransformECC`) dense refinement on downscaled images.
     The SIFT→ECC combination follows large-scale handwriting-extraction
     practice (arXiv:2606.05018).
   - *Local*: coarse-to-fine per-tile phase correlation (8×6 tiles @ ±25px,
     then 16×12 @ ±8px) on ink-emphasized images → smooth displacement field.
     This absorbs paper bend and print-scale error that no single homography
     can model. Measured on real scans: local residuals of 10–12px before,
     ~1–2px after.
   - Metrics recorded per page: RANSAC inlier count/ratio, ECC coefficient,
     median tile residual → `low_confidence` flag.
4. **Dropout** (`dropout.py`):
   - Photometric normalization: background flattening (divide by median-blur
     estimate) + Sauvola adaptive threshold → binary ink maps. Robust to
     shadows and CamScanner's contrast filters.
   - Subtraction with a dilation margin: `filled_ink & ~dilate(template_ink,
     5px)`. The margin absorbs residual misalignment — this single move kills
     edge-ghosting on printed strokes.
   - Component reclaim: a stroke crossing a printed line keeps its full
     connected component (answers written across answer lines are not
     amputated), guarded by a minimum new-ink fraction so long printed lines
     touched by a dot aren't swallowed.
   - **Proximity-ghost filter**: the physical print can differ slightly from
     the blank PDF (bolder glyphs, different dash rendering, small reflow).
     Components whose pixels ≥80% hug the morphologically-closed template
     structure within 6px are print discrepancies, not handwriting.
5. **Peer consensus** (`dropout.drop_shape_matched_components`, optional
   `--peer`): with a second filled copy of the same exam, ink that appears
   with the *same shape* in both copies is print — even where the print
   differs from the blank PDF entirely. Matching is locally rigid, globally
   deformable: each component is matched cell-by-cell (72px cells, ±80px
   translation search, ≥90% pixel coverage within 3px) and dropped only when
   the per-cell shifts form a coherent slowly-varying field. Freehand strokes
   by two different students never match that tightly and coherently.
   *Found necessary in practice:* our validation exam was printed from a
   different document version than the provided blank PDF — a floating Word
   drawing object (a dashed ellipse) sat ~50px away from its PDF position,
   and differently on each printed copy. Template subtraction alone cannot
   remove it (it genuinely differs from the template); shape consensus can.
   Caveat: if two students make a pixel-identical mark at the same spot
   (e.g. a straight underline under the same word), consensus may drop it —
   the filter is opt-in for that reason.
6. **Regions** (`regions.py`):
   - Denoise: tiny specks; hairline ghost fragments; scan-border junk (big
     blobs touching the frame border; anything confined to the outer 6% band
     of the page, where A4 print margins guarantee no legitimate content).
   - Grouping: morphological closing at answer-block scale → connected
     components → padded bounding boxes → merge overlapping boxes. Makes no
     assumption about what handwriting *is*: a lone check-mark, a dense
     essay, and a drawn diagram all come out as regions.
7. **Question zoning** (`questions.py`): word-processor exams carry a text
   layer, so question markers are read from the blank PDF with coordinates —
   no OCR, script-agnostic. Detection is structural: a marker candidate is a
   short token (`6.`, `א`, `b)`) at the *reading-order start* of a visual
   line (RTL-aware; a detached dot token within 8pt counts). Candidates are
   validated hard, because prose can start a line with a short token:
   - main markers must share an x-column (±12pt) *and* form the longest
     increasing numeric sequence in document order — this rejected a `1.–4.`
     list and a mid-line `8.` on the real exam;
   - sub markers must form alphabet-consecutive runs (א,ב,ג… / a,b,c…)
     restarting under each main question.
   Zones are horizontal bands from each anchor to the next (subs nest inside
   mains, questions continue across pages). Region clustering is cut at zone
   boundaries — whole ink strokes still follow their majority side — so
   adjacent answers never merge, and each (sub)question emits one crop
   (`Q6A.png`) spanning its band, extended only if the student's ink itself
   overflows. Limitations: single-column layouts; a blank PDF without a text
   layer skips zoning (OCR anchors = future work).
8. **Output**: one crop per (sub)question (`Q6.png`, `Q6A.png`…) plus per
   region a crop of the registered grayscale scan (natural input for
   downstream HTR) and an ink-only mask crop, and `regions.json` with page
   pairing, per-region question labels, bboxes in pixels and PDF points, ink
   area, and confidence metrics.

## Validation

- **Synthetic end-to-end test** (`tests/`): generates a fake multilingual
  exam PDF, overlays scribbles/check-mark/drawn shapes, simulates the camera
  (residual perspective, sinusoidal paper bend, brightness gradient, sensor
  noise, JPEG round-trip), then asserts every ground-truth region is
  recovered and stray ink is <10% of detected ink.
- **Real data** (not committed — personal data): a 4-page Hebrew science exam
  (Word-origin vector PDF) + two filled copies photographed with an iPhone.
  Both scans were auto-paired to the correct template page. All handwriting
  was recovered: check-marks, circled answers, handwritten words, arrows,
  crossed-out word-bank entries, grade annotations. False positives after the
  full filter chain: essentially zero (the one systematic artifact — the
  reflowed drawing object described above — is removed by peer consensus).

## Failure modes and mitigations

| Failure mode | Mitigation |
|---|---|
| Paper bend / curl | coarse-to-fine tile realignment |
| Uneven lighting, scanner filters | background flattening + Sauvola |
| Sub-pixel misalignment ghosting | dilation margin before subtraction |
| Handwriting crossing printed lines | component-level reclaim |
| Print differs slightly from PDF (font weight, dashes) | proximity-ghost filter |
| Print differs structurally from PDF (reflowed objects) | peer shape consensus (`--peer`) |
| Photo edges, shadows, corner junk | border rules + outer-band rule |
| Pages out of order / missing | descriptor page pairing |
| Unalignable capture (blur, occlusion) | quality metrics → `low_confidence` flag |
| Filled digitally, not scanned | lossless annotation-layer fast path |

## Out of scope / future work

- ML handwritten-vs-printed segmentation for the no-template case
  (HPSegNet-like U-Net; useful as a cross-check on flagged pages).
- HTR/OCR of the extracted crops.
- Color-based ink dropout (camera color is unreliable; geometry suffices).
- Median-of-many-copies template reconstruction (with ≥3 filled copies the
  true printed template can be estimated directly, sidestepping blank-PDF
  fidelity issues entirely).

## References

- Handwriting extraction at scale with SIFT+RANSAC / ECC two-stage alignment:
  *Handwriting Extraction and Analysis of Signature Lists in Swiss Popular
  Initiatives*, arXiv:2606.05018.
- Form dropout / template registration: US patents 9,800,754 (*Global
  registration of filled-out content in an application form*) and 6,640,009
  (*Identification, separation and compression of multiple forms with
  mutants*).
- Forms matching for handwriting field extraction: *Extraction of Arabic
  Handwriting Fields by Forms Matching* (Semantic Scholar 2721/d3f5…).
- Handwritten/printed separation with ML (no-template case): *HPSegNet*
  (Springer, 978-3-031-70642-4_12); *Handwritten Text Segmentation via
  End-to-End Learning of CNN*, arXiv:1906.05229.
- Sauvola adaptive thresholding: Sauvola & Pietikäinen, *Adaptive document
  image binarization*, Pattern Recognition 33 (2000).
