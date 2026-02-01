# Scenario 1: Lightning Payment Timeout Bug (Reproduction & Prevention)

## Overview

This repository includes a reproducible simulation of a critical production issue where Lightning payments occasionally timeout while user balances are still deducted. The issue manifests at approximately 1% under normal traffic and up to 5% during traffic spikes.

The root cause is a non-atomic charge-then-pay flow, where balance deduction occurs before Lightning settlement is confirmed, and failures do not trigger rollback.

---

## Root Cause Summary

**Failure sequence:**

1. User or project balance is deducted
2. Lightning payment is initiated
3. Payment times out or fails
4. Balance is not rolled back

**Result:** User is charged but not paid.

This creates a ledger inconsistency that is difficult to detect without reconciliation or chaos testing.

---

## How This Bug Is Reproduced

Two approaches are provided to demonstrate the issue:

### 1. Failure Injection (Manual or Local Testing)

The mock payment API supports controlled failure injection, allowing simulation of Lightning timeouts without rollback. This reproduces the race condition deterministically and demonstrates how balances drift under failure.

### 2. Load + Chaos Testing (Automated)

A dedicated k6 scenario introduces timeouts under concurrent load. This exposes the issue reliably during traffic spikes and mirrors real-world behavior observed in production.

**Key metrics tracked:**

- Timeout rate
- Balance rollback failures
- Successful vs failed payouts

**Note:** The standard functional test suite validates happy paths and expected errors but does not include chaos scenarios by design.

---

## Testing Gaps That Allowed This Issue

| Gap | Description |
|-----|-------------|
| No chaos or failure-injection testing | Partial failures (timeout after charge) were not simulated |
| No balance reconciliation assertions | Tests verified payout responses but did not assert balance invariants on failure |
| Load testing without data consistency checks | Load tests measured performance, not correctness under degradation |
| Non-atomic transaction boundaries | Charge and settlement were not treated as a single logical unit |

---

## Prevention Strategy

### Immediate Safeguards

- Enforce automatic balance rollback on timeout or payment failure
- Add balance invariants to all payout-related tests:
  - **Success** → balance decreases by amount + fee
  - **Failure** → balance remains unchanged

### Test Strategy Improvements

- Introduce mandatory chaos testing in CI/CD for payment flows
- Add zero-tolerance thresholds for balance inconsistencies
- Expand concurrency tests for retries and idempotency under failure

### Architectural Hardening (Forward-Looking)

- **Saga pattern:** reserve → settle → confirm/cancel
- **Outbox pattern** for exactly-once settlement
- **Continuous reconciliation jobs** with alerting on mismatches

---

## Verification

The fix is validated by re-running the same failure scenarios with rollback enabled. Under identical timeout conditions, balances now reflect only successful payouts, and no discrepancies are observed.

---

## More Information

For detailed reproduction steps, code examples, and implementation details, see:

- [CHAOS-TESTING-LIGHTNING-TIMEOUT.md](../CHAOS-TESTING-LIGHTNING-TIMEOUT.md) - Full technical documentation with curl commands, k6 test instructions, and code fixes
