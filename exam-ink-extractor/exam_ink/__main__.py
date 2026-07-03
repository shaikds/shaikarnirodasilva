"""CLI: python -m exam_ink blank.pdf filled.pdf -o out/"""

import argparse

from .pipeline import extract_handwriting


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="exam_ink",
        description="Extract handwritten regions from a filled exam scan given its blank PDF.",
    )
    parser.add_argument("blank", help="blank exam PDF (the template)")
    parser.add_argument("filled", help="filled exam: scanned PDF or image file")
    parser.add_argument("-o", "--out", default="out", help="output directory (default: out/)")
    parser.add_argument("--dpi", type=float, default=300, help="working resolution (default: 300)")
    parser.add_argument("--debug", action="store_true", help="write intermediate images per page")
    parser.add_argument(
        "--peer",
        action="append",
        default=[],
        metavar="SCAN",
        help="another filled copy of the same exam; repeatable. Enables consensus "
        "filtering of print artifacts shared across copies.",
    )
    args = parser.parse_args()

    pages = extract_handwriting(
        args.blank, args.filled, args.out, dpi=args.dpi, debug=args.debug, peers=args.peer
    )
    for p in pages:
        flag = "  [LOW CONFIDENCE: " + "; ".join(p.confidence_reasons) + "]" if p.low_confidence else ""
        qnames = ", ".join(q.name for q in p.questions) or "-"
        print(
            f"page {p.filled_page} -> template {p.template_page}: "
            f"{len(p.regions)} region(s), questions: {qnames}, ecc={p.ecc_score:.2f}{flag}"
        )
    print(f"crops + regions.json written to {args.out}/")


if __name__ == "__main__":
    main()
