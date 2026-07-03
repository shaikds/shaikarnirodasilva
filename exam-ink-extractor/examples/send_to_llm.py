"""Send each per-question crop to Claude and collect the handwritten answers.

Usage:
    pip install anthropic
    export ANTHROPIC_API_KEY=...   # or `ant auth login`
    python examples/send_to_llm.py out/            # out/ from `python -m exam_ink ...`

Writes out/answers.json: {"Q6A": {"answer": "...", ...}, ...} per page.

Why the Q crops: each Q*.png contains one (sub)question's printed text plus
the student's entire handwritten answer — self-contained context, so the
model needs no other input. Works for any language or answer type.
"""

from __future__ import annotations

import base64
import json
import os
import sys

import anthropic

PROMPT = (
    "This is one question from a scanned exam, containing the printed question "
    "and a student's handwritten answer (any language; the answer may be text, "
    "circled options, check-marks, arrows, or a drawing). Respond with JSON only."
)

SCHEMA = {
    "type": "object",
    "properties": {
        "question_text": {"type": "string", "description": "the printed question, transcribed"},
        "answer": {
            "type": "string",
            "description": "the student's handwritten answer, transcribed exactly; "
            "describe non-text marks (e.g. 'circled שנה', 'check-mark', 'drew an arrow to the moon')",
        },
        "answer_present": {"type": "boolean"},
    },
    "required": ["question_text", "answer", "answer_present"],
    "additionalProperties": False,
}


def main(out_dir: str) -> None:
    client = anthropic.Anthropic()
    pages = json.load(open(os.path.join(out_dir, "regions.json")))

    answers: dict[str, dict] = {}
    for page in pages:
        for q in page.get("questions") or []:
            with open(os.path.join(out_dir, q["crop_path"]), "rb") as f:
                image_b64 = base64.standard_b64encode(f.read()).decode()
            response = client.messages.create(
                model="claude-opus-4-8",
                max_tokens=2048,
                thinking={"type": "adaptive"},
                output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": image_b64,
                                },
                            },
                            {"type": "text", "text": PROMPT},
                        ],
                    }
                ],
            )
            text = next(b.text for b in response.content if b.type == "text")
            answers[q["name"]] = json.loads(text)
            print(f"{q['name']}: {answers[q['name']]['answer']}")

    out_path = os.path.join(out_dir, "answers.json")
    with open(out_path, "w") as f:
        json.dump(answers, f, indent=2, ensure_ascii=False)
    print(f"\nwrote {out_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out")
