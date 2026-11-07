> **Template, not legal advice.** Have local counsel review before use.
>
> **תבנית, לא ייעוץ משפטי.** יש להעביר לבדיקת עורך דין מקומי לפני שימוש.

# Compliance pack / חבילת ציות

Templates the restaurant (controller) and the vendor (processor) use when Restaurant Vision is
installed. They follow the privacy section of the market research
(`reports/מחקר שוק ניתוח וידאו למסעדות.md`): Israel (Amendment 13, guidance 5/2017, *Isakov*),
the US (NYC biometric signage, CCPA, state employee-monitoring notices) and Australia (NSW/ACT
14-day notice, the Bunnings and Kmart decisions). The facts about the system come from
`docs/architecture.md` section 10.

תבניות שהמסעדה (בעלת השליטה) והספק (המעבד) משתמשים בהן בהתקנת Restaurant Vision. הן מבוססות על
פרק הפרטיות במחקר השוק, והעובדות על המערכת לקוחות מסעיף 10 ב-`docs/architecture.md`.

| Document / מסמך | English | עברית | Who uses it / מי משתמש |
|---|---|---|---|
| Customer signage + QR text, NYC variant / שילוט ללקוחות, טקסט QR, נוסח ניו יורק | [signage-en.md](signage-en.md) | [signage-he.md](signage-he.md) | Restaurant / מסעדה |
| Website privacy notice snippet / קטע להודעת פרטיות באתר | [privacy-notice-en.md](privacy-notice-en.md) | [privacy-notice-he.md](privacy-notice-he.md) | Restaurant / מסעדה |
| Staff policy (Israel) + NSW/ACT 14-day notice + US notes / מדיניות לעובדים, הודעת 14 יום, ארה"ב | [staff-notice-en.md](staff-notice-en.md) | [staff-notice-he.md](staff-notice-he.md) | Restaurant as employer / מסעדה כמעסיקה |
| Non-identification statement / הצהרת אי-זיהוי | [non-identification-statement-en.md](non-identification-statement-en.md) | [non-identification-statement-he.md](non-identification-statement-he.md) | Vendor, attached to DPIA and DPA / ספק |
| DPIA template (pre-filled) / תבנית תסקיר השפעה על פרטיות | [dpia-template-en.md](dpia-template-en.md) | [dpia-template-he.md](dpia-template-he.md) | Restaurant with vendor's help / מסעדה בסיוע הספק |
| DPA outline + country riders IL/US/AU / ראשי פרקים להסכם עיבוד מידע | [dpa-outline-en.md](dpa-outline-en.md) | [dpa-outline-he.md](dpa-outline-he.md) | Vendor and restaurant, via counsel / ספק ומסעדה |

## Order of use at a new restaurant / סדר השימוש במסעדה חדשה

1. Sign the DPA with the country rider. / חתימה על הסכם עיבוד המידע עם נספח המדינה.
2. Fill in the DPIA with the camera list and areas; attach the non-identification statement.
   / מילוי התסקיר עם רשימת המצלמות והאזורים; צירוף הצהרת אי-הזיהוי.
3. Staff: Israel, written policy and signed acknowledgements before go-live; NSW/ACT, written
   notice at least 14 days before the start date. / עובדים: בישראל מדיניות כתובה ואישורים חתומים
   לפני העלייה לאוויר; ב-NSW/ACT הודעה בכתב לפחות 14 יום לפני ההתחלה.
4. Post the signs and update the website notice. / הצבת השלטים ועדכון הודעת הפרטיות באתר.
5. Configure privacy masks in the setup wizard and record the evidence in DPIA section 8.
   / הגדרת מסכות פרטיות באשף ההגדרה ותיעוד הראיות בסעיף 8 בתסקיר.

The pilot runbook (`docs/runbooks/pilot-checklist.md`) schedules these steps.
ה-runbook של הפיילוט (`docs/runbooks/pilot-checklist.md`) משבץ את השלבים בלוח הזמנים.

## PDFs / קובצי PDF

The cloud image renders every `*-en.md` / `*-he.md` file to PDF at build time
(`deploy/scripts/compliance_pdfs.py`) and serves them at `/compliance/<name>.pdf`, where the
dashboard's Compliance page links to them (`signage-he.pdf`, `staff-notice-en.pdf`,
`non-identification-statement.pdf` with both languages, and so on). Locally:

```bash
pip install markdown weasyprint   # needs Pango and a Hebrew font (DejaVu Sans)
python deploy/scripts/compliance_pdfs.py docs/compliance build/compliance
```

## Keeping it true / שמירה על דיוק

Any change to detection, tracking, the event schema, retention or the staff features must update
`non-identification-statement-*.md` and the DPIA template in the same pull request. Legal
references reflect the research as of November 2026 and were not verified against primary
statute text.

כל שינוי בזיהוי, במעקב, בסכמת האירועים, בשמירת המידע או ביכולות הנוגעות לצוות מחייב עדכון של הצהרת
אי-הזיהוי ושל תבנית התסקיר באותו שינוי קוד. ההפניות המשפטיות משקפות את המחקר נכון לנובמבר 2026
ולא אומתו מול נוסח החוק המקורי.
