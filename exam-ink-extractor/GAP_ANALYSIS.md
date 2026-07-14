# Gap Analysis — Current System vs. Target Production Architecture

This document honestly maps what `exam-ink-extractor` does today against a
reference 4-stage production handwriting-processing architecture
(pre-processing → HTR engines → LLM contextual correction → human-in-the-loop
+ feedback, with quantitative evaluation). It exists so nobody oversells the
current system: **today we are a strong Stage-1 localization and
form-cleaning component, with a vision-LLM shortcut standing in for Stages
2–3, and only the seed of Stage 4.**

## Stage-by-stage mapping

| Target stage | Status | What we have |
|---|---|---|
| 1. Pre-processing & cleaning | ✅ covered, differentiated | Template dropout: registration + subtraction removes the printed form *exactly*, not generically |
| 2. Specialized HTR engines | ❌ absent | No recognition models at all — we locate handwriting, we do not read it |
| 3. LLM contextual understanding | 🟡 partial | One vision-LLM call per question (`examples/send_to_llm.py`) covers the *outcome* of 2+3, not the architecture |
| 4. Human-in-the-loop + feedback | 🟡 seed only | Per-page `low_confidence` flag exists; no review UI, no feedback loop, no retraining |
| Quantitative evaluation | ❌ not done | Synthetic end-to-end test + visual validation on 3 real exams; no CER/WER/F1 on annotated ground truth |

### Stage 1 — Pre-processing and cleaning: covered, and differentiated

The target describes deskewing, contrast enhancement, and removal of
backgrounds, lines, marks, and stains. We do all of it, but with a stronger
mechanism than generic enhancement, because we exploit the **blank exam
template**:

- Deskew / perspective / paper-bend → three-stage registration
  (SIFT+RANSAC → ECC → per-tile phase-correlation displacement field).
- Lighting and contrast → background flattening + Sauvola adaptive
  binarization (handles phone-camera shadows and scanner filters).
- Printed lines, boxes, and text → **form dropout**: subtraction of the
  registered template ink, with component-level reclaim so handwriting
  crossing a printed line is not amputated.
- Residual print artifacts → proximity-ghost filter (print that renders
  slightly differently than the PDF) and peer shape consensus (print that
  genuinely differs from the blank, e.g. reflowed drawing objects, detected
  by matching other students' copies).

We also do something the target description does not mention: **per-question
spatial localization**. Question numbering (1., א., b)) is read positionally
from the blank PDF's text layer — no OCR, script-agnostic — and each
handwritten answer is delivered as a self-contained crop (`Q6A.png`) tied to
its (sub)question. Validated on real 4-page Hebrew exams from three students:
all 12 pages auto-paired to the correct template page, all Q1–Q14 zones
detected, answers isolated with essentially zero printed-text leakage.

### Stage 2 — HTR engines: absent

This is the largest gap. There is no handwriting *recognition* anywhere in
the pipeline: no HTR models, no multi-engine ensemble/voting, no
Hebrew/Arabic/English-specific models, no handling of final letters or RTL at
the recognition level. Everything in the target's Stage 2 is simply not
built.

### Stage 3 — LLM contextual understanding: partial, via a shortcut

`examples/send_to_llm.py` sends each question crop to a vision LLM with a
structured-output schema and gets back a transcription plus context (the
printed question is in the same image). That single call performs recognition
*and* contextual interpretation at once — so the *outcome* of Stages 2+3 is
approximated, but the described architecture (separate HTR output → LLM as
contextual error-corrector → semantic embedding/indexing for retrieval) does
not exist. There is no embedding index and no standalone
"fix שחם→שכר from context" layer.

### Stage 4 — Human-in-the-loop and feedback: seed only

Every page carries alignment-quality metrics (RANSAC inlier count/ratio, ECC
coefficient, median tile residual) that set a `low_confidence` flag in
`regions.json` — exactly the trigger a route-to-human mechanism needs, and
the design principle matches the target's ("know when you are not sure").
But there is no review interface, no capture of human corrections, and no
feedback loop or retraining (there are no trained models to retrain).

## Confidence: what we actually measure

Today's confidence is **localization confidence** (did the scan align well
enough to trust the extracted regions?), reported per page. The target
describes **recognition confidence** (how sure is the system about each
transcribed field?). We have none of the latter; if the vision-LLM path is
kept, per-field confidence would have to come from the LLM layer and be
calibrated before it is trusted.

## Evaluation: what exists vs. what the target methodology requires

Exists today:

- A synthetic end-to-end test (`tests/`): generates an exam, plants known
  handwriting, simulates camera capture, asserts 100% region recall and a
  <10% stray-ink budget, and checks question-zone assignment.
- Visual validation on three real filled exams (overlay inspection).

Missing for the target's methodology:

- An annotated ground-truth dataset of real exams (field-level truth).
- CER/WER on transcriptions; Precision/Recall/F1 per extracted field.
- Confidence-vs-accuracy calibration curves (does `low_confidence` actually
  predict errors?).
- Hallucination and guardrails testing of the LLM step (does it transcribe
  only what is on the page?).
- Latency and cost monitoring.

Until that harness exists, no accuracy percentage should be quoted for this
system beyond "high-recall localization demonstrated visually on N real
exams".

## Roadmap to the target architecture (ordered)

1. **Annotated evaluation set first** — have humans transcribe a set of real
   exams field-by-field; wire up automatic CER/WER and field-level F1 against
   pipeline+LLM output. Everything else is guesswork until this exists.
2. **Recognition confidence + HITL routing** — surface per-field confidence
   from the LLM step, calibrate it against the eval set, and route low-scoring
   fields to a human review queue (the `low_confidence` page flag joins this
   as a second trigger).
3. **Decide Stage 2** — measure whether a dedicated HTR engine (or ensemble)
   beats the vision-LLM on the eval set for the target scripts; adopt only if
   the numbers justify the added complexity.
4. **Semantic indexing** — embed transcriptions for meaning-based retrieval
   and cross-document validation.
5. **Feedback loop** — feed human corrections back as few-shot examples /
   fine-tuning data and as regression cases in the eval set.
