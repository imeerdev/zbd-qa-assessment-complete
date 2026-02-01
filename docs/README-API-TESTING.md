# Option A: API Testing with Load Component

## Overview

This directory contains a complete API testing solution including:
- **Mock Payment API** - Express.js server simulating ZBD-style Bitcoin rewards payouts
- **Functional Tests** - 14 test suites (42 individual tests) using Jest & Supertest
- **Load Tests** - Both k6 and Artillery.io configurations for 50-100 concurrent users
- **Test Report** - Detailed findings in [LOAD-TEST-REPORT.md](./LOAD-TEST-REPORT.md)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Mock API

```bash
npm start
# API runs on http://localhost:3000
```

### 3. Run Functional Tests

```bash
# In another terminal
npm test

# With coverage report
npm run test:coverage
```

Expected output:
```
PASS  ./functional-tests.test.js
  Payment API Functional Tests
    TC-F001: Happy Path - Single Payout
      ✓ should create a successful payout with correct balance deduction including 2% fee
    TC-F002: Input Validation - Missing Fields
      ✓ should reject request with missing gamertag
      ✓ should reject request with missing amount
    ...
    TC-F014: 2% Service Fee
      ✓ should calculate 2% fee correctly on standard payout
      ✓ should round fee up (ceiling) on odd amounts
    ...

Test Suites: 1 passed, 1 total
Tests:       42 passed, 42 total
```

### 4. Run Load Tests

#### Option 1: Artillery (Recommended for simplicity)

```bash
# Install Artillery globally
npm install -g artillery

# Run load test
npm run load-test

# Generate HTML report
npm run load-test:report
```

#### Option 2: k6 (Recommended for advanced metrics)

```bash
# Install k6: https://k6.io/docs/getting-started/installation/

# Run load test
npm run load-test:k6
```

## Test Coverage

### Functional Tests (14 Test Suites, 42 Tests)

| Test ID | Scenario | Priority | Status |
|---------|----------|----------|--------|
| TC-F001 | Happy path - single payout | P1 | PASS |
| TC-F002 | Input validation - missing fields | P1 | PASS |
| TC-F003 | Boundary values - amount limits | P1 | PASS |
| TC-F004 | Idempotency - duplicate detection | P1 | PASS |
| TC-F005 | Rate limiting - 10 per hour enforcement | P1 | PASS |
| TC-F006 | Insufficient balance error | P1 | PASS |
| TC-F007 | Unknown project handling | P2 | PASS (documents BUG-004) |
| TC-F008 | Idempotency key scope | P1 | PASS (documents BUG-005) |
| TC-F009 | Payout status values | P2 | PASS |
| TC-F010 | Callback/webhook functionality | P2 | PASS |
| TC-F011 | Expiration handling | P2 | PASS |
| TC-F012 | Description field limits | P3 | PASS |
| TC-F013 | Internal ID tracking | P3 | PASS |
| TC-F014 | **2% service fee calculation** | P1 | PASS |

### Load Test Scenarios

1. **Normal Payouts** (80% of traffic)
   - Creates unique payouts with random amounts
   - Tests system under realistic load
   
2. **Balance Checks** (10% of traffic)
   - Queries developer balances
   - Tests read operations under load
   
3. **Duplicate Requests** (10% of traffic)
   - Intentional duplicate idempotency keys
   - Validates idempotency under concurrency

### Load Test Configuration

```
Phase 1: Warm-up        - 5 req/s   (30s)
Phase 2: Ramp-up        - 5→50 req/s (60s)
Phase 3: Sustained Load - 50 req/s   (120s)
Phase 4: Spike Test     - 100 req/s  (30s)
Phase 5: Cool-down      - 10 req/s   (30s)
```

## API Endpoints

### POST /api/v1/payouts
Create a new payout to a ZBD gamertag

**Request**:
```json
{
  "gamertag": "player_001",
  "amount": 1000,
  "projectId": "project_test_001",
  "idempotencyKey": "unique_key_123",
  "description": "Level completion bonus",
  "callbackUrl": "https://example.com/webhook"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "payout_1706472234567_abc123",
    "gamertag": "player_001",
    "amount": 1000,
    "fee": 20,
    "totalCost": 1020,
    "projectId": "project_test_001",
    "idempotencyKey": "unique_key_123",
    "status": "completed",
    "expiresIn": 300,
    "expiresAt": "2026-01-28T10:35:00.000Z",
    "createdAt": "2026-01-28T10:30:00.000Z"
  },
  "message": "Payout created successfully"
}
```

**Note**: A 2% service fee is applied to all payouts:
- `amount`: The payout amount sent to the gamertag
- `fee`: 2% service fee (rounded up)
- `totalCost`: Total deducted from project balance (amount + fee)
```

### GET /api/v1/payouts/:id
Retrieve payout details

### GET /api/v1/projects/:id/balance
Get project balance

### POST /api/v1/projects/:id/fund
Fund project account (test endpoint)

### PATCH /api/v1/payouts/:id/status
Update payout status (pending, completed, expired, error)

### DELETE /api/v1/test/reset
Reset all data (test endpoint)

## Key Findings from Load Tests

For detailed load test results, see [LOAD-TEST-REPORT.md](./LOAD-TEST-REPORT.md).

**Summary**:
- **Idempotency**: Zero duplicate payouts in 9,200 requests
- **Rate Limiting**: Correctly enforces 10 payouts per gamertag per hour
- **Data Consistency**: No balance inconsistencies detected
- **P50 Response Time**: 145ms (excellent)
- **P95 Response Time**: 650ms at 100 users (needs optimization)
- **Recommendation**: Replace in-memory storage with Redis/PostgreSQL for production

## Files Included

```
HandsOnExerciseABC/
├── payment-api.js                # Mock API server
├── functional-tests.test.js      # Jest test suite
├── load-test.js                  # k6 load test
├── load-test-artillery.yml       # Artillery load test
├── artillery-functions.js        # Artillery helpers
├── LOAD-TEST-REPORT.md          # Detailed findings
├── package.json                  # Dependencies & scripts
└── README-API-TESTING.md        # This file
```

## Architecture Decisions

### Why Express.js?
- Lightweight and fast
- Industry standard for Node.js APIs
- Easy to mock and test

### Why Jest & Supertest?
- Jest: Most popular Node.js testing framework
- Supertest: Specifically designed for HTTP API testing
- Great integration, clear syntax

### Why k6 AND Artillery?
- **k6**: Better for advanced metrics, production monitoring
- **Artillery**: Simpler to set up, good enough for most tests
- Provided both to demonstrate flexibility

### Why In-Memory Storage?
- Fast to implement for demo
- **Trade-off**: Not production-ready (no persistence, limited concurrency)
- **Recommendation**: Use Redis or PostgreSQL for production

## Test Data

### Preconfigured Accounts
- **Test Project**: `project_test_001` (100,000 sats balance)
- **Load Test Projects**: 10 game studio projects (1,000,000 sats each):
  - `project_arcade_games`, `project_puzzle_masters`, `project_action_studio`, etc.

### Test Gamertags
- Dynamically generated per test
- Format: `player_<scenario>_<random>`

## CI/CD Integration

This test suite is integrated into the CI/CD pipeline. See [README-CICD-PIPELINE.md](./README-CICD-PIPELINE.md) for:
- GitHub Actions workflow configuration
- Branch protection setup
- Coverage enforcement (80% minimum)
- Matrix testing across Node.js 16, 18, 20

## Production Considerations

If implementing in production:

1. **Replace in-memory storage** with Redis/PostgreSQL
2. **Add real authentication** (API keys with project scoping)
3. **Implement real webhooks** (currently logged, not sent)
4. **Add monitoring** (Prometheus, DataDog)
5. **Load test at scale** (500+ concurrent users)

## Estimated Effort

- **Setup Time**: 10 minutes
- **Running Functional Tests**: 2-3 seconds
- **Running Load Tests**: 5 minutes
- **Total Time Investment**: ~6 hours to create this solution

## Questions?

This comprehensive API testing suite demonstrates:
- Functional test design (happy path + error conditions)
- Load testing methodology (50-100 concurrent users)
- Performance analysis and recommendations
- Production-ready test infrastructure

Ready to be integrated into a real project or extended further.
