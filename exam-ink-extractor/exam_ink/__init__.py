"""exam_ink — extract handwritten regions from a filled exam given its blank PDF template.

Language-agnostic form dropout: register the filled scan onto the blank
template, subtract the template ink, and everything that remains is
handwriting (text, shapes, drawings — any script).
"""

from .pipeline import extract_handwriting

__all__ = ["extract_handwriting"]
__version__ = "0.1.0"
