# Project Lifecycle - End to End

## Overview

```
Discovery → Assessment → Proposal → Contract → Setup → Development → QA → Deploy → Handoff → Support
   1           2            3          4         5         6          7      8        9        10
```

---

## Phase 1: Discovery (Day 1)

**Goal:** Understand the client's needs, budget, and timeline.

**Actions:**
1. Schedule discovery call (30-60 min)
2. Fill [CLIENT_DISCOVERY.md](../onboarding/CLIENT_DISCOVERY.md)
3. Determine service type
4. Assess if project is a good fit
5. Request access to existing system (if applicable)

**Output:** Completed discovery document + go/no-go decision

---

## Phase 2: Technical Assessment (Day 2-3)

**Goal:** Evaluate the technical scope and effort.

**For No-Code→Production:**
1. Get access to Base44/Lovable export
2. Complete [TECHNICAL_ASSESSMENT.md](../onboarding/TECHNICAL_ASSESSMENT.md)
3. Identify critical issues (security, performance, errors)
4. Estimate remediation effort

**For AI Agents:**
1. Map the process to automate
2. Define agent requirements (tools, data sources, model)
3. Identify integration points
4. Estimate complexity

**For Custom Development:**
1. Create high-level architecture
2. Define data model
3. List API endpoints / features
4. Identify third-party integrations

**Output:** Effort estimate + risk assessment

---

## Phase 3: Proposal (Day 3-4)

**Goal:** Present a clear proposal with pricing.

**Actions:**
1. Use [ESTIMATION_FRAMEWORK.md](../estimation/ESTIMATION_FRAMEWORK.md) for hours/pricing
2. Choose appropriate package from [SERVICE_PACKAGES.md](../estimation/SERVICE_PACKAGES.md)
3. Fill [PROPOSAL_TEMPLATE.md](../contracts/PROPOSAL_TEMPLATE.md)
4. Include 2 options if possible (good/better)
5. Send to client

**Output:** Professional proposal document

---

## Phase 4: Contract (Day 5-7)

**Goal:** Finalize agreement and receive payment.

**Actions:**
1. Address client questions on proposal
2. Negotiate if needed (scope, not price)
3. Fill [SLA_TEMPLATE.md](../contracts/SLA_TEMPLATE.md)
4. Send for signature
5. Receive upfront payment (50%)

**Output:** Signed SLA + first payment

---

## Phase 5: Project Setup (Day 1 of project)

**Goal:** Set up all infrastructure for development.

**Actions:**
1. Follow [CLIENT_PROJECT_SETUP.md](CLIENT_PROJECT_SETUP.md)
2. Create GitHub repository
3. Copy from client-project-template
4. Set up CI/CD, linting, testing framework
5. Create project board (Kanban) with all issues
6. Create V1.0 milestone
7. Set up communication channel with client
8. Schedule kickoff call

**Output:** Ready-to-develop repository + Kanban board

---

## Phase 6: Development (Week 1-N)

**Goal:** Build the deliverables.

**Daily routine:**
```
Morning:
  1. Check Kanban board
  2. Pick highest priority issue
  3. Create feature branch
  4. Code + commit (small, logical commits)
  5. Push to remote

Afternoon:
  6. Create PR when feature complete
  7. Self-review PR
  8. Merge to main
  9. Update Kanban board
  10. Push any remaining work
```

**Weekly routine:**
```
Start of week:
  - Review sprint goals
  - Prioritize issues
  - Plan the week

End of week:
  - Send WEEKLY_STATUS_REPORT to client
  - Update milestone progress
  - Plan next week
```

**Rules:**
- WIP limit: 2 tasks max in progress
- Branch naming: `feature/XX-description`
- Commit format: `feat|fix|test(scope): message`
- All code goes through PRs
- CI must be green before merge
- Demo to client at each milestone

---

## Phase 7: QA & Testing (Week N)

**Goal:** Ensure everything works and is production-ready.

**Checklist:**
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing on staging
- [ ] Mobile testing
- [ ] Cross-browser testing
- [ ] Performance testing (load time < 3s)
- [ ] Security review (no exposed secrets, input validation)
- [ ] Accessibility check
- [ ] SEO check (if applicable)
- [ ] Client UAT (User Acceptance Testing) - client tests and approves

---

## Phase 8: Deployment (Week N+1)

**Goal:** Deploy to production.

**Actions:**
1. Set up production environment
2. Configure domain and SSL
3. Deploy application
4. Run smoke tests on production
5. Set up monitoring (uptime, errors)
6. Verify all integrations work in production
7. Set up automated backups

---

## Phase 9: Handoff (Week N+1)

**Goal:** Transfer everything to the client.

**Actions:**
1. Complete [PROJECT_CLOSEOUT.md](../contracts/PROJECT_CLOSEOUT.md)
2. Transfer all credentials
3. Deliver documentation
4. Conduct training session
5. Collect final payment
6. Define warranty period

---

## Phase 10: Post-Launch Support

**Goal:** Ensure smooth operation and build long-term relationship.

**Warranty period (30 days):**
- Fix any bugs in delivered functionality
- Response time: 24h

**After warranty:**
- Offer maintenance retainer
- Monthly check-in call (first 3 months)
- Request testimonial
- Ask for referrals
