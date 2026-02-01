# Automation Strategy

## Philosophy

Automate high-value, repetitive tests. Keep complex scenarios manual where human judgment adds value.

**Target:** 80% automation coverage

---

## Automation Priority

| Priority | Category | Why Automate |
|----------|----------|--------------|
| **High** | Happy path, input validation, rate limiting | Catches 60% of bugs, minimal maintenance |
| **High** | Idempotency, fee calculation | Prevents financial loss |
| **Medium** | Webhooks, status transitions | Common integration points |
| **Low** | Fraud detection, security testing | Requires human judgment, patterns evolve |

---

## Tech Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| Functional | Jest + Supertest | API testing |
| Load | k6 / Artillery | Performance validation |
| CI/CD | GitHub Actions | Automated quality gates |
| Infrastructure | Terraform | Repeatable deployments |

---

## Implementation

See [HandsOnExerciseABC/](../HandsOnExerciseABC/) for working examples:
- `functional-tests.test.js` - 42 tests in 14 suites
- `load-test.js` - k6 load scenarios (5 parallel, 50-100 VUs)
- `.github/workflows/ci-cd.yml` - 8-job CI/CD pipeline
- `terraform/` - AWS infrastructure + smoke tests

---

## Test Data Strategy

```javascript
beforeEach(async () => {
  await request(app).delete('/api/v1/test/reset');
});
```

- Reset state before each test
- No test pollution
- Parallel execution safe
- Reproducible results

---

## Metrics

| Metric | Target |
|--------|--------|
| Coverage | 80% line coverage |
| Stability | <5% flaky tests |
| Execution | Unit tests <2 min |
| Maintenance | <10% QA time on fixes |
