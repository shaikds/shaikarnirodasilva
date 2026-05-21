#!/usr/bin/env bash
# בלם אוטומטי — תבנית. החלף את הפקודות בבדיקות האמיתיות של הפרויקט.
# exit code != 0 => התהליך נחסם.
set -euo pipefail

echo "[guardrail] running project checks..."

# --- חווט את הבדיקות שלך כאן ---
# דוגמאות (בטל הערה והתאם לסטאק):
#   npm test
#   npm run lint
#   npm run typecheck
#   ./gradlew test
#   pytest -q

echo "[guardrail] no checks wired yet — edit .claude/hooks/guardrail.sh"

# כל עוד לא חווטו בדיקות, הבלם עובר. אחרי החיווט, פקודה שנכשלת
# תעצור את הבלם בזכות 'set -e'.
exit 0
