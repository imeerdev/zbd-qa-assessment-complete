# Rewards SDK – Test Plan

**Feature:** Achievement-Based Bitcoin Payouts

**Related Documents:**
For detailed implementation details, including automation, load testing, CI/CD, and infrastructure, refer to the supporting documents below.

- [Automation Strategy](../automation-strategy.md)
- [Functional Tests](../../HandsOnExerciseABC/functional-tests.test.js)
- [Load Tests](../../HandsOnExerciseABC/load-test.js)
- [Load Test Report](../LOAD-TEST-REPORT.md)
- [CI/CD Pipeline](../../.github/workflows/ci-cd.yml)
- [Infrastructure (Terraform)](../../HandsOnExerciseABC/terraform/)

---

## Priority Definitions

| Priority | Description |
|----------|-------------|
| **P1** | Critical: Financial loss, security breach, or feature failure. Blocks release. |
| **P2** | High: Major impact, must fix before release. |
| **P3** | Medium: Minor impact, can ship with documented workaround. |
| **P4** | Low: Cosmetic defects, fix in next sprint. |

---

## 1. Test Scope

**Prioritized (Release-Critical)**

- Reward payout creation (1–100,000 sats)
- User identity & account state validation
- Rate limiting (max 10 rewards per user/hour)
- Anti-fraud enforcement (block after 3 failed attempts / 10 min)
- Duplicate reward prevention (idempotency)
- Developer reward pool funding & balance enforcement
- 2% service fee calculation and deduction
- Payout delivery SLA (≤ 60 seconds)
- Webhook delivery for success/failure
- Dashboard accuracy (BTC distributed, unique users, failed attempts)
- Testnet mode isolation (no real BTC movement)

**Deferred (will be in next sprint)**

- Multi-region latency optimization
- Extended poor-network / chaos testing
- Long-term, behavior-based fraud modeling

**Rationale:** Scope prioritizes financial correctness, abuse prevention, and partner trust for initial SDK launch.

---

## 2. Critical Test Scenarios

| Test ID | Scenario | Expected Result | Priority |
|---------|----------|-----------------|----------|
| TC-01 | Valid achievement payout (e.g., 1,000 sats) | User credited within 60s; 2% fee applied; webhook success sent | P1 |
| TC-02 | Min / Max payout (1 sat / 100k sats) | Accepted with correct fee rounding | P1 |
| TC-03 | Duplicate reward claim (same event/idempotency key) | Original result returned; no duplicate payout | P1 |
| TC-04 | Rate limit exceeded (11th reward in 1 hour) | Rejected with rate-limit error; no payout | P1 |
| TC-05 | Anti-fraud trigger (3 failed attempts in 10 min) | User blocked; further attempts rejected | P1 |
| TC-06 | Insufficient developer balance (incl. fee) | Payout rejected; balances unchanged | P1 |
| TC-07 | Suspended user account | Payout rejected with validation error | P1 |
| TC-08 | Webhook endpoint returns 5xx / timeout | Retries with backoff; failure recorded | P1 |
| TC-09 | Payout exceeds 60s SLA | Status remains pending; async completion | P1 |
| TC-10 | Testnet mode enabled | Fake sats only; no real BTC movement | P1 |

---

## 3. Test Environment Strategy

- Use testnet mode with fake sats for all automated and manual testing
- Separate staging environment mirroring production logic (ledger, rate limits, fraud rules)
- Mock or simulate payout settlement to validate SLA and retries without real funds
- Small, tightly controlled canary (optional) with allow-listed accounts for final validation
- Full observability: payout latency, duplicate detection, webhook delivery metrics

**Goal:** Validate financial correctness and failure handling without risking real Bitcoin.

---

## 4. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Duplicate payouts | Financial loss, trust damage | Idempotency keys, uniqueness constraints, concurrency tests |
| Ledger mismatch (fees vs payouts) | Incorrect balances, reporting errors | Invariant checks (payouts + fees = debits), reconciliation |
| Abuse / fraud draining pools | Developer fund loss | Rate limits, block rules, anomaly alerts |
| SLA breaches | Poor user experience | Async processing, latency monitoring, alerts |
| Webhook failures | Partner distrust, lost confirmations | Retry with backoff, DLQ, replay tooling |

---

## Observational Testing

- **Fraud patterns:** Human review of anomaly alerts, evolving abuse tactics
- **Lightning Network edge cases:** Real network latency, routing failures
- **Dashboard UX:** Visual verification of metrics accuracy
- **Security testing:** Penetration testing, request forgery attempts

---

## Summary

This plan focuses on money safety, abuse prevention, and reliability, the highest-risk areas for a Bitcoin rewards SDK, while remaining intentionally concise and practical for an initial release.

To keep this plan concise and on schedule, I focused on payout correctness, idempotency, and abuse prevention. I deferred deeper network chaos testing and advanced fraud modeling, which I would prioritize post-launch once real traffic patterns are observed.
