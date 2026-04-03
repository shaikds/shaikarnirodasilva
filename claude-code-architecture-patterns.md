# Claude Code Architecture Patterns - דפוסים ארכיטקטוניים לבניית סוכני AI

> מבוסס על ניתוח הקוד הפתוח של Claude Code מבית Anthropic

---

## 1. מערכת Dream Memories - למידה עצמית בין סשנים

### ארכיטקטורת 4 שכבות זיכרון

| שכבה | מי כותב | מה מכיל | טעינה |
|---|---|---|---|
| **CLAUDE.md** | המשתמש | הוראות, כללים, סטנדרטים | מלא בתחילת כל סשן |
| **Auto Memory** | הסוכן עצמו | תובנות, דפוסים, תיקוני באגים | 200 שורות ראשונות / 25KB |
| **Session Memory** | המערכת | היסטוריית שיחה | בתוך הסשן בלבד |
| **Auto Dream** | סוכן משנה | איחוד וניקוי זיכרון | בין סשנים |

### Dream - איחוד זיכרון כמו שנת REM

סוכן משנה רץ בין סשנים ומבצע 4 שלבים:

1. **Orient** - סריקת תיקיית הזיכרון וקריאת האינדקס
2. **Gather Signal** - סריקת תמלילי סשנים אחרונים (grep ממוקד, לא קריאה מלאה)
3. **Consolidate** - מיזוג מידע חדש, מחיקת סתירות, הסרת כפילויות
4. **Prune & Index** - שמירת MEMORY.md מתחת ל-200 שורות

**תנאי הפעלה:** 24+ שעות מאז האיחוד האחרון **וגם** 5+ סשנים חדשים.

### איך ליישם באייגנטים שלך

```python
# דוגמה: מערכת זיכרון לכל אייגנט
class AgentMemory:
    def __init__(self, agent_name):
        self.memory_file = f"memories/{agent_name}/MEMORY.md"
        self.detailed_dir = f"memories/{agent_name}/topics/"
    
    def should_save(self, insight):
        """שמור רק מה שלא ניתן לגלות מהקוד"""
        return (
            insight.is_env_specific or      # ספציפי לסביבה
            insight.from_user_correction or  # תיקון משתמש
            insight.is_undocumented          # לא מתועד
        )
    
    def dream_consolidate(self):
        """הרצה בין סשנים - כמו שנת REM"""
        entries = self.read_all_memories()
        # הסר כפילויות
        entries = self.deduplicate(entries)
        # הסר סתירות - השאר את החדש
        entries = self.resolve_conflicts(entries)
        # גזום ל-200 שורות
        entries = self.prune(entries, max_lines=200)
        self.write_index(entries)
```

---

## 2. ארכיטקטורת סוכני משנה (Sub-agents)

### העיקרון: כל סוכן בחלון הקשר עצמאי

| סוכן | מודל | כלים | תפקיד |
|---|---|---|---|
| **Explore** | Haiku (זול/מהיר) | קריאה בלבד | חיפוש וניתוח קוד |
| **Plan** | יורש מהראשי | קריאה בלבד | מחקר ותכנון |
| **Worker** | יורש מהראשי | כל הכלים | ביצוע משימות |
| **Verification** | יורש מהראשי | קריאה + הרצה | אימות תוצאות |

### Explore Agent - למה הוא כל כך יעיל

**הסוד: הוא קריאה-בלבד לחלוטין.**

- לא יכול ליצור, לערוך, או למחוק קבצים
- רץ על מודל זול (Haiku) כי לא צריך יכולת כתיבה
- מחזיר רק סיכום קצר לשיחה הראשית - חוסך הקשר

```python
# דוגמה: הגדרת סוכן קריאה-בלבד
explore_agent = Agent(
    name="explorer",
    model="haiku",
    tools=["read_file", "search", "glob", "grep"],  # קריאה בלבד!
    system_prompt="""
    Your role is EXCLUSIVELY to search and analyze existing code.
    You CANNOT create, edit, or delete any files.
    Return a concise summary of your findings.
    """
)
```

### Coordinator Mode - תזמור רב-סוכנים

**העיקרון: המתזמר לא כותב קוד. הוא מתכנן, מנתב, ומסנתז.**

```
                    ┌─────────────┐
                    │ Coordinator │
                    │ (no coding) │
                    └──────┬──────┘
              ┌────────────┼────────────┐
              v            v            v
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Explorer │ │  Worker  │ │ Verifier │
        │(read-only)│ │(all tools)│ │(adversarial)│
        └──────────┘ └──────────┘ └──────────┘
```

**כללים:**
- משימות מחקר (קריאה בלבד) - **במקביל**
- משימות כתיבה - **סדרתי** למניעת קונפליקטים
- אימות - **במקביל** ליישום על אזורי קבצים שונים

---

## 3. מודעות עצמית ב-System Prompt

### הרעיון המהפכני: הסוכן מזהיר את עצמו

Claude Code כולל בפרומפט שלו רשימת **דפוסי כישלון ידועים** - טעויות שהמודל נוטה אליהן:

```markdown
## Known Failure Patterns (Self-Awareness)

You tend to make these mistakes. Be vigilant:

1. **Over-engineering**: Adding error handling for impossible scenarios
2. **Scope creep**: Adding features beyond what was asked
3. **Premature abstraction**: Creating helpers for one-time operations
4. **Context assumptions**: Assuming code context without reading the file first
5. **Blind retry**: Retrying the same failed approach without diagnosing why
```

### Verification Agent - אימות אדברסרי

סוכן ייעודי שמאתגר את התוצאות:

```python
verification_prompt = """
You are an adversarial verifier. For each change:

1. Run builds, tests, and linters
2. Perform at least ONE adversarial probe per change area:
   - Boundary values
   - Concurrency edge cases
   - Idempotency (running twice should be safe)
   - Orphan operations (what if step 2 fails after step 1?)

3. Issue verdict: PASS / FAIL / PARTIAL
"""
```

---

## 4. ניהול הקשר (Context Management)

### שלוש שכבות דחיסה

1. **Micro-compaction** (~60-70% ניצול) - דוחס תוצאות כלים ישנות, שיחה נשארת שלמה
2. **Auto-compaction** (סף טוקנים) - מסכם שיחה ישנה, מוחק הודעות ישנות
3. **Manual compaction** - המשתמש מפעיל עם פוקוס: `/compact focus on API changes`

### טעינה עצלה (Lazy Loading)

- **Skills** - רק תיאור קצר נטען בתחילה, תוכן מלא רק בשימוש
- **MCP Tools** - רק שמות הכלים צורכים הקשר עד לשימוש בפועל
- **CLAUDE.md בתת-תיקיות** - נטען רק כשקוראים קבצים באותה תיקייה

---

## 5. דפוס שיפור עצמי - המעגל השלם

```
סשן 1: אייגנט מרקטינג נכשל בכתיבת מודעה
    ↓
תיקון משתמש: "השתמש בטון יותר ישיר"
    ↓
Auto Memory: שומר "מודעות - טון ישיר, לא פורמלי"
    ↓
Dream (בין סשנים): מאחד עם למידות קודמות
    ↓
סשן 2: אייגנט מרקטינג כותב מודעה בטון ישיר ✓
    ↓
סשן 10: אייגנט מרקטינג מומחה בסגנון הספציפי שלך ✓
```

### יישום מעשי - כל אייגנט עם learnings.md משלו

```python
# אייגנט מרקטינג
marketing_agent = Agent(
    name="marketing",
    memory_file="agents/marketing/learnings.md",
    system_prompt=load_file("agents/marketing/prompt.md") + 
                  load_file("agents/marketing/learnings.md")
)

# אייגנט פרודוקט  
product_agent = Agent(
    name="product",
    memory_file="agents/product/learnings.md",
    system_prompt=load_file("agents/product/prompt.md") + 
                  load_file("agents/product/learnings.md")
)

# כל אייגנט לומד בנפרד!
```

---

## סיכום: 10 דפוסים ליישום מיידי

| # | דפוס | מה לעשות |
|---|---|---|
| 1 | **זיכרון היררכי** | בנו שכבות: גלובלי > פרויקט > אישי > מקומי |
| 2 | **למידה סלקטיבית** | שמרו רק תובנות שלא ניתן לגלות מהקוד |
| 3 | **Dream (איחוד זיכרון)** | הריצו "שלב שינה" שמאחד ומגזם |
| 4 | **סוכני משנה מבודדים** | כל סוכן בהקשר נפרד עם כלים מוגבלים |
| 5 | **קריאה-בלבד כאילוץ** | סוכני מחקר לא יכולים לכתוב |
| 6 | **Coordinator Mode** | מתזמר שמאציל ולא מבצע |
| 7 | **אימות אדברסרי** | בדיקות boundary/concurrency/idempotency |
| 8 | **מודעות עצמית** | תעדו חולשות ידועות בפרומפט |
| 9 | **דחיסה רב-שכבתית** | דחסו כלים ישנים תחילה, שיחה רק כשנדרש |
| 10 | **טעינה עצלה** | תיאורים קלים בהתחלה, תוכן מלא רק בשימוש |

---

## מקורות

- [Claude Code Docs - Memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Claude Code Docs - Sub-agents](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
- [Claude Code - GitHub](https://github.com/anthropics/claude-code)
- [Claude API - Compaction](https://docs.anthropic.com/en/docs/build-with-claude/context-windows)
