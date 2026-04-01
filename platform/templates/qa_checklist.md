# QA Checklist - {{project_name}}

**Client:** {{client_name}} ({{client_company}})
**Service Type:** {{service_type}}
**Date:** {{date}}
**Tested By:** ___

---

## Pre-QA Requirements
- [ ] All development sprints completed
- [ ] All PRs merged to main branch
- [ ] Staging environment deployed and accessible
- [ ] Test data prepared

---

## 1. Automated Testing

### Unit Tests
- [ ] All unit tests pass (`make test`)
- [ ] Coverage is acceptable (target: >60%)
- [ ] No skipped tests without documented reason

```bash
# Run test suite
make test

# Check coverage
make test-coverage
```

**Test results:** ___ passed / ___ failed / ___ skipped
**Coverage:** ___%

### Linting & Code Quality
- [ ] Linter passes clean (`make lint`)
- [ ] No type errors
- [ ] No security warnings

---

## 2. Functional Testing

### Authentication (if applicable)
- [ ] User registration works
- [ ] Login with valid credentials succeeds
- [ ] Login with invalid credentials shows error
- [ ] Password reset flow works
- [ ] Session/token expiration works
- [ ] Protected routes redirect unauthenticated users
- [ ] Role-based access control enforced

### Core Features
| # | Feature | Test Steps | Pass? | Notes |
|---|---------|------------|:-----:|-------|
| 1 | _[Feature]_ | _[Steps to test]_ | [ ] | ___ |
| 2 | _[Feature]_ | _[Steps to test]_ | [ ] | ___ |
| 3 | _[Feature]_ | _[Steps to test]_ | [ ] | ___ |
| 4 | _[Feature]_ | _[Steps to test]_ | [ ] | ___ |
| 5 | _[Feature]_ | _[Steps to test]_ | [ ] | ___ |

### CRUD Operations
- [ ] Create: new records save correctly
- [ ] Read: data displays correctly
- [ ] Update: changes persist
- [ ] Delete: records removed, cascades work
- [ ] List: pagination works, filters work
- [ ] Search: returns correct results

### Forms & Validation
- [ ] Required fields enforced
- [ ] Email format validated
- [ ] Number ranges validated
- [ ] Error messages are helpful and specific
- [ ] Success messages/feedback shown
- [ ] Form state clears after submission

---

## 3. Error Handling

- [ ] 404 page displays for invalid URLs
- [ ] API errors return proper HTTP status codes
- [ ] User sees friendly error messages (not stack traces)
- [ ] Network errors handled gracefully (offline state)
- [ ] Empty states handled (no data scenarios)
- [ ] Loading states shown during async operations
- [ ] Form validation errors highlight specific fields

---

## 4. Security Testing

- [ ] No secrets in source code (grep for API keys, passwords)
- [ ] Environment variables used for configuration
- [ ] SQL injection: test with `'; DROP TABLE --` in inputs
- [ ] XSS: test with `<script>alert('xss')</script>` in inputs
- [ ] CORS: verify only allowed origins accepted
- [ ] HTTPS: verify redirect from HTTP
- [ ] Auth tokens: verify expiration and refresh
- [ ] File uploads: verify type and size restrictions

---

## 5. Performance Testing

### Page Load
| Page | Target | Actual | Pass? |
|------|:------:|:------:|:-----:|
| Home/Landing | < 3s | ___s | [ ] |
| Dashboard | < 3s | ___s | [ ] |
| List view | < 3s | ___s | [ ] |
| Detail view | < 2s | ___s | [ ] |

### API Response Times
| Endpoint | Target | Actual | Pass? |
|----------|:------:|:------:|:-----:|
| GET /api/... (list) | < 500ms | ___ms | [ ] |
| GET /api/... (detail) | < 200ms | ___ms | [ ] |
| POST /api/... | < 500ms | ___ms | [ ] |
| PUT /api/... | < 300ms | ___ms | [ ] |

### Lighthouse Scores (if frontend)
| Category | Target | Actual | Pass? |
|----------|:------:|:------:|:-----:|
| Performance | > 80 | ___ | [ ] |
| Accessibility | > 80 | ___ | [ ] |
| Best Practices | > 80 | ___ | [ ] |
| SEO | > 80 | ___ | [ ] |

---

## 6. Cross-Browser Testing

| Browser | Version | Desktop | Mobile | Notes |
|---------|---------|:-------:|:------:|-------|
| Chrome | Latest | [ ] | [ ] | ___ |
| Firefox | Latest | [ ] | [ ] | ___ |
| Safari | Latest | [ ] | [ ] | ___ |
| Edge | Latest | [ ] | - | ___ |

### Mobile Devices
| Device | OS | Pass? | Notes |
|--------|------|:-----:|-------|
| iPhone (Safari) | iOS 17+ | [ ] | ___ |
| Android (Chrome) | Android 13+ | [ ] | ___ |
| iPad (Safari) | iPadOS 17+ | [ ] | ___ |

---

## 7. Responsive Design

- [ ] Desktop (1920px) - layout correct
- [ ] Laptop (1366px) - layout correct
- [ ] Tablet (768px) - layout adapts
- [ ] Mobile (375px) - layout adapts
- [ ] No horizontal scrolling on any viewport
- [ ] Touch targets at least 44x44px on mobile
- [ ] Text readable without zooming on mobile

---

## 8. Deployment Checklist

- [ ] Production environment variables set
- [ ] Database migrated to production
- [ ] SSL certificate active
- [ ] Domain configured correctly
- [ ] CDN configured (if applicable)
- [ ] Error monitoring active (Sentry/equivalent)
- [ ] Uptime monitoring active
- [ ] Backup system configured
- [ ] CI/CD pipeline deploys successfully

---

## QA Summary

| Category | Status | Issues Found |
|----------|:------:|:------------:|
| Automated Tests | Pass/Fail | ___ |
| Functional | Pass/Fail | ___ |
| Error Handling | Pass/Fail | ___ |
| Security | Pass/Fail | ___ |
| Performance | Pass/Fail | ___ |
| Cross-Browser | Pass/Fail | ___ |
| Responsive | Pass/Fail | ___ |
| Deployment | Pass/Fail | ___ |

### Critical Issues (Must Fix Before Launch)
1. ___
2. ___

### Non-Critical Issues (Can Fix Post-Launch)
1. ___
2. ___

### Sign-Off
- [ ] QA approved by SilvA.i
- [ ] UAT approved by {{client_name}} ({{client_company}})
- [ ] Ready for production deployment
