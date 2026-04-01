# SilvA.i Platform - End-to-End Use Case Guide

## How It Works (TL;DR)

```
New client contacts you
    ↓
Open platform → Create project (30 seconds)
    ↓
Platform generates documents + tells you what to do at each step
    ↓
You follow the checklist, fill in forms, advance through 11 phases
    ↓
Project delivered, retainer offered
```

---

## Step-by-Step: Your First Project

### 0. Start the Platform

```bash
cd platform
uvicorn app:app --reload --port 8000
# Open http://localhost:8000
```

---

### 1. Create a Project (30 seconds)

1. Click **"+ New Project"** in sidebar
2. **Step 1:** Enter client info (name, company, email)
3. **Step 2:** Name the project, pick service type, set budget/timeline
4. **Step 3:** Review → **"Create Project"**

The platform auto-creates **11 phases with 45+ tasks** ready for you.

---

### 2. Work Through the 11 Phases

For each phase, the flow is always:

```
Click "Start Phase"
    ↓
Platform auto-generates documents (proposals, checklists, etc.)
    ↓
Click "Edit Document" → fill in the form fields → Save
    ↓
Check off your manual tasks one by one
    ↓
All tasks done → Click "Complete & Advance"
    ↓
Next phase begins
```

---

## The 11 Phases in Detail

### Phase 1: Discovery
**What the platform does for you:**
- Generates a full discovery questionnaire with your client's name pre-filled

**What you do:**
1. Open the generated questionnaire → click **"Edit Document"**
2. Schedule a 30-60 min call with the client
3. During the call, fill in the form fields (business description, problems, users, budget)
4. Check the service type checkbox (AI Agents / NoCode→Prod / Web Dev / Retainer)
5. Assess if the project is a good fit
6. **Save** the document → all your answers are preserved
7. Check off all tasks → **Advance**

---

### Phase 2: Technical Assessment
**What the platform does:**
- Generates a technical audit checklist (60+ checkboxes across 10 categories)

**What you do:**
1. Request access to the client's existing system (URL, code, Base44/Lovable export)
2. Open the checklist → score each category (security, performance, code quality, etc.)
3. Document your Go/No-Go decision
4. Check off tasks → **Advance**

> **Skip this phase** if the project is built from scratch (click "Skip Phase")

---

### Phase 3: Estimation
**What the platform does:**
- Generates an estimation worksheet with T-shirt sizing, task catalog, and pricing formulas

**What you do:**
1. Open the worksheet → fill in task breakdown (task name, size, hours)
2. Apply complexity multipliers (new tech? integrations? unclear requirements?)
3. Calculate total hours and price
4. Set your final quote
5. Check off tasks → **Advance**

---

### Phase 4: Proposal
**What the platform does:**
- Generates a professional client proposal with client name, project details, timeline, and pricing pre-filled

**What you do:**
1. Open the proposal → customize the text (challenge, goal, features, tech stack)
2. Review pricing and timeline
3. **Copy** the clean markdown → paste into email or convert to PDF
4. Send to client
5. Follow up in 3 days if no response
6. Check off tasks → **Advance**

---

### Phase 5: Contract & SLA
**What the platform does:**
- Generates a full SLA with scope, milestones, payment terms, warranty, and IP clauses

**What you do:**
1. Open the SLA → fill in deliverables, exclusions, milestone dates
2. Review terms with client (scope, payments, warranty)
3. Both parties sign
4. Receive 50% upfront payment
5. Check off tasks → **Advance**

---

### Phase 6: Project Setup
**What the platform does:**
- Generates setup instructions (GitHub repo naming, CI/CD config, Kanban columns)

**What you do:**
1. Create GitHub repo: `client-{name}-{project}`
2. Copy your project template into it
3. Set up CI/CD (GitHub Actions), .env, branch protection
4. Create Kanban board (Backlog → Sprint → In Progress → Review → Done)
5. Schedule kickoff meeting with client
6. Check off tasks → **Advance**

---

### Phase 7: Development
**What the platform does:**
- Generates a sprint planning template

**What you do:**
1. Work through tasks on your Kanban board
2. Create feature branches and PRs (never push to main directly)
3. Self-review all code (no debug code, no secrets, tests pass)
4. Demo progress to client (share staging URL)
5. Check off tasks → **Advance**

---

### Phase 8: Weekly Updates
**What the platform does:**
- Generates a weekly status report template

**What you do:**
1. Open the report → fill in: completed tasks, planned tasks, blockers
2. Send the report to client (email or Slack)
3. Check off tasks → **Advance**

---

### Phase 9: QA & Testing
**What the platform does:**
- Generates a comprehensive QA checklist (unit tests, smoke tests, mobile, browser, security, accessibility)

**What you do:**
1. Run test suite (`make test` - all must pass)
2. Manual smoke test on staging
3. Test on mobile + different browsers
4. Get client UAT (User Acceptance Testing) approval
5. Check off tasks → **Advance**

---

### Phase 10: Deployment & Closeout
**What the platform does:**
- Generates a handoff document with credential transfer checklist

**What you do:**
1. Deploy to production (HTTPS, domain, database, monitoring)
2. Transfer all credentials to client (GitHub, hosting, DB, API keys)
3. Conduct 1-hour knowledge transfer session
4. Collect final payment
5. Request testimonial for portfolio
6. Check off tasks → **Advance**

---

### Phase 11: Retainer Offer
**What the platform does:**
- Generates a retainer proposal with 3 tiers (Basic $400, Standard $750, Premium $1,400/month)

**What you do:**
1. Present the retainer options to client
2. Recommend a tier based on project complexity
3. If accepted → sign retainer agreement
4. Check off tasks → **Project Complete!**

---

## Platform Features Cheat Sheet

| Action | How |
|--------|-----|
| **Create project** | Sidebar → "+ New Project" → 3-step wizard |
| **Start a phase** | Project page → "Start Phase" button |
| **View/edit document** | Click "Edit Document" → fill form fields → Save |
| **Check off a task** | Click the checkbox (updates instantly, no reload) |
| **Advance to next phase** | "Complete & Advance" button (enabled when all tasks done) |
| **Go back to previous phase** | Click any completed phase in the timeline |
| **Reopen a completed phase** | Click "Reopen Phase" button on that phase |
| **Copy document for sharing** | Click "Copy MD" in the document viewer |
| **Filter dashboard** | Use the status/type dropdowns and search box |
| **Switch views** | Sidebar → Dashboard / Kanban / CRM buttons |
| **Add/manage clients** | Sidebar → "Clients" |

---

## 3 View Modes

| View | Best For | How |
|------|----------|-----|
| **Dashboard** | Quick daily check-in (5 min morning routine) | Default view - stats, alerts, project cards |
| **Kanban** | See all projects by phase in columns | Sidebar → Kanban button |
| **CRM** | Client-focused view with project history | Sidebar → CRM button |

---

## Quick Reference: What Gets Auto-Generated

| Phase | Document Generated | Size |
|-------|--------------------|------|
| 1. Discovery | Discovery questionnaire | ~4,500 chars |
| 2. Assessment | Technical audit checklist | ~6,300 chars |
| 3. Estimation | Estimation worksheet | ~3,600 chars |
| 4. Proposal | Client proposal | ~3,400 chars |
| 5. Contract | SLA document | ~4,800 chars |
| 6. Setup | Sprint planning guide | ~3,000 chars |
| 7. Development | Sprint template | ~3,000 chars |
| 8. Updates | Weekly report template | ~1,400 chars |
| 9. QA | QA checklist | ~4,900 chars |
| 10. Closeout | Handoff document | ~3,200 chars |
| 11. Retainer | Retainer proposal | ~3,000 chars |

**Total: ~41,000 characters of auto-generated documents per project**

---

## Tips

1. **Fill documents during calls** - Open the discovery questionnaire while on the call with the client
2. **Copy MD for sharing** - Use "Copy MD" to get clean markdown for emails or PDF conversion
3. **Skip phases when needed** - Not every project needs assessment (e.g., web dev from scratch)
4. **Revisit past phases** - Click any completed phase in the timeline to review/edit documents
5. **Dashboard alerts** - Check alerts daily: "Phase stuck 8 days" means you need to act
6. **Retainer = recurring revenue** - Always offer retainer in Phase 11, even if client says no initially
