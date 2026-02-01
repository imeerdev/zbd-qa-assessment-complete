# Scenario 1: Lightning Payment Timeout Bug

## The Problem

**Bug:** Lightning payments occasionally fail with timeout, but users are still charged.

| Condition | Failure Rate |
|-----------|--------------|
| Normal traffic | ~1% |
| Traffic spikes | ~5% |

**Root Cause:** The payment flow has a race condition:
1. User's balance is deducted (charge)
2. Lightning payment is initiated
3. Payment times out or fails
4. **Bug:** Balance is NOT rolled back → User charged but not paid

---

## How to Reproduce

### Prerequisites

```bash
cd HandsOnExerciseABC
npm install
```

### Method 1: Manual Testing (Quick Demo)

```bash
# Terminal 1: Start the API
npm start

# Terminal 2: Enable failure injection (5% timeout rate, NO rollback)
curl -X POST http://localhost:3000/api/v1/test/failure-injection \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "timeoutRate": 0.05, "rollbackOnTimeout": false}'

# Check starting balance
curl http://localhost:3000/api/v1/projects/project_test_001/balance
# Returns: 100,000 sats

# Make multiple payout requests (some will timeout)
for i in {1..20}; do
  curl -X POST http://localhost:3000/api/v1/payouts \
    -H "Content-Type: application/json" \
    -d "{\"gamertag\": \"test_player_$i\", \"amount\": 1000, \"projectId\": \"project_test_001\", \"idempotencyKey\": \"timeout_test_$i\"}"
  echo ""
done

# Check balance again - it will be LOWER than expected
# (charged for timeouts that never completed)
curl http://localhost:3000/api/v1/projects/project_test_001/balance
```

**Expected Bug Behavior:** Balance drops by 1,020 sats (1,000 + 2% fee) for EACH timeout, even though no payment was made.

### Method 2: Automated Load Test (Comprehensive)

```bash
# Install k6: https://k6.io/docs/getting-started/installation/

# Run the timeout recovery test scenario
k6 run --env SCENARIO=timeout_recovery load-test.js

# Or run full load test (timeout scenario starts at 4 minutes)
k6 run load-test.js
```

**Key Metrics to Watch:**
- `timeout_errors` - Count of injected timeouts
- `balance_rollback_failures` - Count of unrecovered balances (THE BUG)

**Note:** The functional tests (`npm test`) do NOT include this chaos scenario - they test happy paths and expected errors. You need the k6 load test to reproduce this timing-dependent bug.

---

## What Testing Gap Allowed This?

### Gap 1: No Chaos/Failure Injection Testing

**Problem:** Tests only covered happy paths and expected errors. No tests simulated:
- Network timeouts mid-transaction
- Partial failures (charged but not paid)
- Race conditions under load

**Evidence:** Original test suite had 42 tests, all passing, but none tested transactional integrity during failures.

### Gap 2: Missing Balance Reconciliation Checks

**Problem:** Tests verified payouts completed but never verified:
- Balance before vs. balance after for failed transactions
- Exactly-once payment guarantees
- Rollback behavior on timeout

### Gap 3: No Load Testing with Failure Injection

**Problem:** Load tests measured throughput and latency but not:
- Behavior under degraded conditions
- Data consistency during concurrent failures
- Recovery from partial failures

### Gap 4: Insufficient Transaction Boundary Testing

**Problem:** The charge-then-pay flow was not atomic:
```
BEGIN TRANSACTION (implicit)
  1. Deduct balance    ← Success
  2. Make payment      ← Timeout/Failure
  3. No rollback       ← BUG: Step 1 not reversed
END TRANSACTION (never happens)
```

---

## Prevention Strategy Going Forward

### Immediate Fixes

#### 1. Implement Automatic Rollback on Timeout

```javascript
// In payment-api.js - payout endpoint
if (shouldTimeout) {
  // CRITICAL: Rollback balance before returning error
  project.balance += totalCost;
  return res.status(504).json({
    success: false,
    error: { code: 'PAYMENT_TIMEOUT', message: 'Payment timed out' }
  });
}
```

#### 2. Add Balance Reconciliation to All Tests

```javascript
// Before operation
const balanceBefore = await getBalance(projectId);

// Attempt operation (may fail)
const result = await createPayout(payload);

// After operation
const balanceAfter = await getBalance(projectId);

// Verify consistency
if (result.success) {
  expect(balanceAfter).toBe(balanceBefore - totalCost);
} else {
  expect(balanceAfter).toBe(balanceBefore); // No change on failure
}
```

### Testing Improvements

#### 1. Mandatory Chaos Testing in CI/CD

Add to `.github/workflows/ci-cd.yml`:
```yaml
chaos-testing:
  runs-on: ubuntu-latest
  steps:
    - name: Run timeout recovery tests
      run: |
        npm start &
        sleep 5
        k6 run --env SCENARIO=timeout_recovery load-test.js
```

#### 2. Balance Invariant Checks

Add custom k6 thresholds:
```javascript
thresholds: {
  'balance_rollback_failures': ['count==0'],  // Zero tolerance
  'timeout_errors': ['count>0'],              // Ensure chaos is working
}
```

#### 3. Test Scenarios to Add

| Scenario | What It Tests | Priority |
|----------|---------------|----------|
| Timeout after charge | Balance rollback | P1 |
| Concurrent timeouts | Race condition handling | P1 |
| Timeout + retry | Idempotency under failure | P1 |
| Spike + timeout | 5% failure rate simulation | P1 |

### Architectural Improvements

#### 1. Saga Pattern Implementation

```
Step 1: Reserve balance (pending state)
Step 2: Execute payment
Step 3a: On success → Confirm reservation
Step 3b: On failure → Cancel reservation (automatic rollback)
```

#### 2. Outbox Pattern for Exactly-Once Delivery

```
1. Write payout + balance change to DB in single transaction
2. Background worker processes outbox
3. Mark as processed after Lightning payment confirms
4. Retry logic with idempotency
```

#### 3. Monitoring & Alerting

```yaml
alerts:
  - name: PaymentTimeoutRate
    condition: timeout_rate > 2%
    severity: warning

  - name: BalanceMismatch
    condition: expected_balance != actual_balance
    severity: critical
```

---

## Verification

### Confirm the Fix Works

```bash
# Enable failure injection WITH rollback
curl -X POST http://localhost:3000/api/v1/test/failure-injection \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "timeoutRate": 0.05, "rollbackOnTimeout": true}'

# Check balance
curl http://localhost:3000/api/v1/projects/project_test_001/balance
# Returns: 100,000 sats

# Make requests (some will timeout)
for i in {1..20}; do
  curl -X POST http://localhost:3000/api/v1/payouts \
    -H "Content-Type: application/json" \
    -d "{\"gamertag\": \"fix_test_$i\", \"amount\": 1000, \"projectId\": \"project_test_001\", \"idempotencyKey\": \"fix_test_$i\"}"
done

# Check balance again
curl http://localhost:3000/api/v1/projects/project_test_001/balance
# Balance only decreased for SUCCESSFUL payouts, not timeouts
```

---

## Summary

| Question | Answer |
|----------|--------|
| **How to reproduce** | Enable failure injection with `rollbackOnTimeout: false`, run load test, observe balance discrepancy |
| **Testing gap** | No chaos testing, no balance reconciliation checks, no failure injection in CI/CD |
| **Prevention strategy** | Automatic rollback, mandatory chaos testing, balance invariants, saga pattern |

---

## Related Files

- [payment-api.js](../HandsOnExerciseABC/payment-api.js) - Mock API with failure injection
- [load-test.js](../HandsOnExerciseABC/load-test.js) - k6 test with `timeout_recovery` scenario
- [functional-tests.test.js](../HandsOnExerciseABC/functional-tests.test.js) - Jest test suite
- [test-plan.md](../TestPlanPRD/test-plan.md) - Overall test strategy
