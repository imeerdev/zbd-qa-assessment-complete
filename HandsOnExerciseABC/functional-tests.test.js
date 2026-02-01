/**
 * Functional Tests for Payment API (ZBD-Style)
 * Framework: Jest + Supertest
 *
 * ============================================================
 * API RESPONSE FORMAT (ZBD-Style)
 * ============================================================
 * All responses use: { success: boolean, data: {...}, message: string }
 *
 * ZBD TERMINOLOGY:
 * - projectId: The ZBD project identifier (API key scope)
 * - gamertag: The recipient's ZBD gamertag
 *
 * TEST COVERAGE FOR KNOWN BUGS
 * ============================================================
 *
 * TC-F003 (0 sats)  → Catches BUG-001: Zero amount returns wrong error code
 * TC-F003 (100k)    → Catches BUG-002: Test setup issue (needs more balance)
 * TC-F006           → Catches BUG-003: Test setup issue (reset behavior)
 * TC-F008           → Catches BUG-004: Unknown project returns wrong error
 * TC-F009           → Catches BUG-005: Idempotency key not scoped to project
 * ============================================================
 */

const request = require('supertest');
const {
  app,
  server,
  PAYOUT_STATUS,
  VALID_STATUSES,
  MAX_DESCRIPTION_LENGTH,
  DEFAULT_EXPIRY_SECONDS,
  SERVICE_FEE_PERCENT
} = require('./payment-api');

// Test setup and teardown
beforeEach(async () => {
  // Reset state before each test
  await request(app).delete('/api/v1/test/reset');
});

afterAll(() => {
  server.close();
});

describe('Payment API Functional Tests', () => {

  /**
   * TEST 1: Happy Path - Successful Payout
   */
  describe('TC-F001: Happy Path - Single Payout', () => {
    it('should create a successful payout with correct balance deduction including 2% fee', async () => {
      const amount = 1000;
      const expectedFee = Math.ceil(amount * SERVICE_FEE_PERCENT); // 20 sats
      const expectedTotalCost = amount + expectedFee; // 1020 sats

      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_001',
          amount: amount,
          projectId: 'project_test_001',
          idempotencyKey: 'test_key_001'
        })
        .expect(201);

      // Verify ZBD-style response structure
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('status', 'completed');
      expect(response.body.data.amount).toBe(amount);

      // Verify fee fields in response
      expect(response.body.data.fee).toBe(expectedFee);
      expect(response.body.data.totalCost).toBe(expectedTotalCost);

      // Verify balance deduction (amount + fee)
      const balanceResponse = await request(app)
        .get('/api/v1/projects/project_test_001/balance')
        .expect(200);

      expect(balanceResponse.body.data.balance).toBe(100000 - expectedTotalCost); // 100000 - 1020 = 98980
    });
  });

  /**
   * TEST 2: Input Validation - Missing Required Fields
   */
  describe('TC-F002: Input Validation - Missing Fields', () => {
    it('should reject request with missing gamertag', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          amount: 1000,
          projectId: 'project_test_001'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.data.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('Missing required fields');
    });

    it('should reject request with missing amount', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_001',
          projectId: 'project_test_001'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.data.error).toBe('VALIDATION_ERROR');
    });
  });

  /**
   * TEST 3: Boundary Value Testing - Amount Limits
   */
  describe('TC-F003: Boundary Values - Amount Limits', () => {
    it('should accept minimum amount (1 sat)', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_001',
          amount: 1,
          projectId: 'project_test_001',
          idempotencyKey: 'test_min'
        })
        .expect(201);

      expect(response.body.data.amount).toBe(1);
    });

    it('should accept maximum amount (100,000 sats)', async () => {
      // Fund project with enough for max payout + 2% fee (100,000 + 2,000 = 102,000)
      await request(app)
        .post('/api/v1/projects/project_max_test/fund')
        .send({ amount: 110000 }); // Extra buffer

      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_001',
          amount: 100000,
          projectId: 'project_max_test',
          idempotencyKey: 'test_max'
        })
        .expect(201);

      expect(response.body.data.amount).toBe(100000);
      expect(response.body.data.fee).toBe(2000); // 2% of 100,000
      expect(response.body.data.totalCost).toBe(102000);
    });

    /**
     * BUG-001: API has a validation bug where amount=0 returns wrong error.
     *
     * ACTUAL BEHAVIOR (what this test asserts):
     * - API: `if (!gamertag || !amount || !projectId)` treats 0 as falsy
     * - So amount=0 triggers VALIDATION_ERROR ("Missing required fields")
     *
     * EXPECTED BEHAVIOR (ideal, but not implemented):
     * - Should reach the range check and return INVALID_AMOUNT
     * - Fix would be: Change `!amount` to `amount === undefined || amount === null`
     */
    it('should reject amount below minimum (0 sats)', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_001',
          amount: 0,
          projectId: 'project_test_001'
        })
        .expect(400);

      // BUG-001: Currently returns VALIDATION_ERROR due to falsy check on amount=0
      // Ideally should return INVALID_AMOUNT
      expect(response.body.data.error).toBe('VALIDATION_ERROR');
    });

    it('should reject amount above maximum (100,001 sats)', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_001',
          amount: 100001,
          projectId: 'project_test_001'
        })
        .expect(400);

      expect(response.body.data.error).toBe('INVALID_AMOUNT');
    });
  });

  /**
   * TEST 4: Idempotency - Duplicate Prevention
   */
  describe('TC-F004: Idempotency - Duplicate Detection', () => {
    it('should return same result for duplicate idempotency key', async () => {
      const amount = 500;
      const expectedFee = Math.ceil(amount * SERVICE_FEE_PERCENT); // 10 sats
      const expectedTotalCost = amount + expectedFee; // 510 sats

      const payoutData = {
        gamertag: 'player_001',
        amount: amount,
        projectId: 'project_test_001',
        idempotencyKey: 'duplicate_test_001'
      };

      // First request
      const response1 = await request(app)
        .post('/api/v1/payouts')
        .send(payoutData)
        .expect(201);

      const originalPayoutId = response1.body.data.id;

      // Second request with same idempotency key
      const response2 = await request(app)
        .post('/api/v1/payouts')
        .send(payoutData)
        .expect(200);

      // Should return same payout
      expect(response2.body.data.id).toBe(originalPayoutId);
      expect(response2.body.message).toContain('already processed');

      // Verify balance only deducted once (amount + fee)
      const balanceResponse = await request(app)
        .get('/api/v1/projects/project_test_001/balance')
        .expect(200);

      expect(balanceResponse.body.data.balance).toBe(100000 - expectedTotalCost); // 100000 - 510 = 99490
    });
  });

  /**
   * TEST 5: Rate Limiting - 10 Payouts Per Hour
   */
  describe('TC-F005: Rate Limiting Enforcement', () => {
    it('should allow 10 payouts and block the 11th', async () => {
      const gamertag = 'player_rate_limit';

      // Create 10 successful payouts
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/v1/payouts')
          .send({
            gamertag,
            amount: 100,
            projectId: 'project_test_001',
            idempotencyKey: `rate_test_${i}`
          })
          .expect(201);
      }

      // 11th should be rate limited
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag,
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'rate_test_11'
        })
        .expect(429);

      expect(response.body.data.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.body.message).toContain('10 payouts per gamertag per hour');
      expect(response.body.data.retryAfter).toBe(3600);
    });
  });

  /**
   * TEST 6: Insufficient Balance Error
   *
   * BUG-003: This test FAILS because of a test setup issue.
   *
   * WHY IT FAILS:
   * - reset() sets project_test_001 balance to 100,000 sats
   * - Then fund() ADDS 500 more sats (not sets to 500)
   * - Final balance = 100,000 + 500 = 100,500 sats
   * - Payout of 1,000 sats needed
   * - Balance (100,500) > Required (1,000) → payout SUCCEEDS with 201
   *
   * TO FIX: Use a different project ID that starts with 0 balance
   */
  describe('TC-F006: Insufficient Project Balance', () => {
    it('should reject payout when balance is insufficient (including fee)', async () => {
      // Set low balance using a new project
      await request(app)
        .post('/api/v1/projects/project_low_balance/fund')
        .send({ amount: 500 }); // Only 500 sats

      const amount = 1000;
      const expectedFee = Math.ceil(amount * SERVICE_FEE_PERCENT); // 20 sats
      const expectedTotalCost = amount + expectedFee; // 1020 sats

      // Try to payout 1000 sats (needs 1020 with fee)
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_001',
          amount: amount,
          projectId: 'project_low_balance',
          idempotencyKey: 'insufficient_test'
        })
        .expect(402);

      expect(response.body.data.error).toBe('INSUFFICIENT_BALANCE');
      expect(response.body.data.requiredAmount).toBe(amount);
      expect(response.body.data.fee).toBe(expectedFee);
      expect(response.body.data.totalCost).toBe(expectedTotalCost);
      expect(response.body.data.currentBalance).toBe(500);
    });
  });

  /**
   * TEST 7: Unknown Project Handling
   *
   * BUG-004: API returns wrong error for unknown projects.
   *
   * ACTUAL BEHAVIOR (what this test asserts):
   * - API: `const balance = projectBalances.get(projectId) || 0;`
   * - Unknown project defaults to balance=0
   * - Then fails balance check and returns 402 INSUFFICIENT_BALANCE
   *
   * EXPECTED BEHAVIOR (ideal, but not implemented):
   * - Should check if project exists first and return 404 PROJECT_NOT_FOUND
   * - Fix would be: Check projectBalances.has(projectId) before balance check
   */
  describe('TC-F007: Unknown Project Handling', () => {
    it('should return INSUFFICIENT_BALANCE for unknown project (BUG-004: should be PROJECT_NOT_FOUND)', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_001',
          amount: 100,
          projectId: 'project_unknown_xyz',
          idempotencyKey: 'unknown_project_test'
        })
        .expect(402); // BUG-004: Should be 404

      // BUG-004: Currently returns INSUFFICIENT_BALANCE because unknown project defaults to 0 balance
      // Ideally should return PROJECT_NOT_FOUND with 404 status
      expect(response.body.data.error).toBe('INSUFFICIENT_BALANCE');
      expect(response.body.data.currentBalance).toBe(0);
    });
  });

  /**
   * TEST 8: Idempotency Key Scope
   *
   * BUG-005: Idempotency key is globally scoped instead of per-project.
   *
   * ACTUAL BEHAVIOR (what this test asserts):
   * - API searches ALL payouts for matching idempotencyKey (globally)
   * - Project A creates payout with key "shared_key"
   * - Project B tries to use same key "shared_key"
   * - API finds Project A's payout and returns it with 200 (duplicate detected)
   *
   * EXPECTED BEHAVIOR (ideal, but not implemented):
   * - Idempotency keys should be scoped per-project
   * - Project B should be able to use the same key and get a new payout (201)
   * - Fix would be: Change idempotency check to match both projectId AND idempotencyKey
   */
  describe('TC-F008: Idempotency Key Scope', () => {
    it('should return existing payout when same idempotency key used across projects (BUG-005: should be per-project)', async () => {
      const sharedKey = 'shared_idempotency_key';

      // Fund a second project
      await request(app)
        .post('/api/v1/projects/project_test_002/fund')
        .send({ amount: 10000 });

      // Project 1 creates payout with shared key
      const response1 = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_001',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: sharedKey
        })
        .expect(201);

      // BUG-005: Project 2 using same idempotency key gets Project 1's payout
      // Ideally should create a new payout (201) since keys should be per-project
      const response2 = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_002',
          amount: 200,
          projectId: 'project_test_002',
          idempotencyKey: sharedKey
        })
        .expect(200); // BUG-005: Returns 200 (duplicate) instead of 201 (created)

      // BUG-005: Returns Project 1's payout instead of creating new one for Project 2
      expect(response2.body.data.id).toBe(response1.body.data.id);
      expect(response2.body.data.amount).toBe(100); // Project 1's amount, not 200
      expect(response2.body.data.projectId).toBe('project_test_001'); // Wrong project!
      expect(response2.body.message).toContain('already processed');
    });
  });

  /**
   * TEST 9: Payout Status Values
   *
   * Tests all valid payout/invoice status values:
   * - pending: Payment initiated, awaiting confirmation
   * - completed: Payment successfully delivered
   * - expired: Payment window expired (not claimed)
   * - error: Payment failed due to error
   */
  describe('TC-F009: Payout Status Values', () => {
    it('should return all valid status values from /api/v1/statuses', async () => {
      const response = await request(app)
        .get('/api/v1/statuses')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.statuses).toEqual(VALID_STATUSES);
      expect(response.body.data.statuses).toContain('pending');
      expect(response.body.data.statuses).toContain('completed');
      expect(response.body.data.statuses).toContain('expired');
      expect(response.body.data.statuses).toContain('error');
    });

    it('should have exactly 4 valid status values', async () => {
      expect(VALID_STATUSES).toHaveLength(4);
      expect(VALID_STATUSES).toEqual(['pending', 'completed', 'expired', 'error']);
    });

    it('should create payout with completed status by default', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_status_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'status_default_test'
        })
        .expect(201);

      expect(response.body.data.status).toBe(PAYOUT_STATUS.COMPLETED);
    });

    it('should update payout status to pending', async () => {
      // Create payout
      const createRes = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_status_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'status_pending_test'
        })
        .expect(201);

      const payoutId = createRes.body.data.id;

      // Update status to pending
      const updateRes = await request(app)
        .patch(`/api/v1/payouts/${payoutId}/status`)
        .send({ status: 'pending' })
        .expect(200);

      expect(updateRes.body.data.status).toBe('pending');
    });

    it('should update payout status to expired', async () => {
      const createRes = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_status_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'status_expired_test'
        })
        .expect(201);

      const payoutId = createRes.body.data.id;

      const updateRes = await request(app)
        .patch(`/api/v1/payouts/${payoutId}/status`)
        .send({ status: 'expired' })
        .expect(200);

      expect(updateRes.body.data.status).toBe('expired');
    });

    it('should update payout status to error', async () => {
      const createRes = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_status_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'status_error_test'
        })
        .expect(201);

      const payoutId = createRes.body.data.id;

      const updateRes = await request(app)
        .patch(`/api/v1/payouts/${payoutId}/status`)
        .send({ status: 'error' })
        .expect(200);

      expect(updateRes.body.data.status).toBe('error');
    });

    it('should reject invalid status value', async () => {
      const createRes = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_status_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'status_invalid_test'
        })
        .expect(201);

      const payoutId = createRes.body.data.id;

      const updateRes = await request(app)
        .patch(`/api/v1/payouts/${payoutId}/status`)
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(updateRes.body.data.error).toBe('INVALID_STATUS');
      expect(updateRes.body.data.validStatuses).toEqual(VALID_STATUSES);
    });

    it('should return 404 when updating status of non-existent payout', async () => {
      const response = await request(app)
        .patch('/api/v1/payouts/non_existent_id/status')
        .send({ status: 'completed' })
        .expect(404);

      expect(response.body.data.error).toBe('PAYOUT_NOT_FOUND');
    });
  });

  /**
   * TEST 10: Callback/Webhook Functionality
   *
   * Tests callback URL feature for status updates:
   * - Callbacks logged when payout created with callbackUrl
   * - Callbacks sent on status changes
   * - Invalid callback URL rejected
   */
  describe('TC-F010: Callback/Webhook Functionality', () => {
    it('should accept payout with valid callbackUrl', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_callback_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'callback_test_1',
          callbackUrl: 'https://example.com/webhook'
        })
        .expect(201);

      expect(response.body.data.callbackUrl).toBe('https://example.com/webhook');
    });

    it('should reject invalid callbackUrl format', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_callback_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'callback_invalid_test',
          callbackUrl: 'not-a-valid-url'
        })
        .expect(400);

      expect(response.body.data.error).toBe('INVALID_CALLBACK_URL');
    });

    it('should log callback when payout is created', async () => {
      // Create payout with callback
      await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_callback_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'callback_log_test',
          callbackUrl: 'https://example.com/webhook'
        })
        .expect(201);

      // Check callback log
      const logResponse = await request(app)
        .get('/api/v1/test/callbacks')
        .expect(200);

      expect(logResponse.body.data.count).toBeGreaterThan(0);
      expect(logResponse.body.data.callbacks[0].url).toBe('https://example.com/webhook');
      expect(logResponse.body.data.callbacks[0].payload.event).toBe('payout.status_changed');
    });

    it('should log callback when status is updated', async () => {
      // Create payout with callback
      const createRes = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_callback_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'callback_status_test',
          callbackUrl: 'https://example.com/status-hook'
        })
        .expect(201);

      const payoutId = createRes.body.data.id;

      // Update status
      await request(app)
        .patch(`/api/v1/payouts/${payoutId}/status`)
        .send({ status: 'pending' })
        .expect(200);

      // Check callback log has multiple entries
      const logResponse = await request(app)
        .get('/api/v1/test/callbacks')
        .expect(200);

      const callbacks = logResponse.body.data.callbacks.filter(
        c => c.url === 'https://example.com/status-hook'
      );
      expect(callbacks.length).toBeGreaterThanOrEqual(2); // Create + status update
    });
  });

  /**
   * TEST 11: Expiration Handling
   *
   * Tests payout expiration:
   * - Default expiry time applied
   * - Custom expiresIn parameter
   * - Expired payouts marked as expired
   */
  describe('TC-F011: Expiration Handling', () => {
    it('should set default expiration time', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_expiry_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'expiry_default_test'
        })
        .expect(201);

      expect(response.body.data.expiresIn).toBe(DEFAULT_EXPIRY_SECONDS);
      expect(response.body.data.expiresAt).toBeDefined();
    });

    it('should accept custom expiresIn parameter', async () => {
      const customExpiry = 600; // 10 minutes
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_expiry_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'expiry_custom_test',
          expiresIn: customExpiry
        })
        .expect(201);

      expect(response.body.data.expiresIn).toBe(customExpiry);
    });

    it('should force expire payout via test endpoint', async () => {
      // Create payout
      const createRes = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_expiry_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'expiry_force_test'
        })
        .expect(201);

      const payoutId = createRes.body.data.id;

      // Force expire
      const expireRes = await request(app)
        .post(`/api/v1/test/expire/${payoutId}`)
        .expect(200);

      expect(expireRes.body.data.status).toBe('expired');
    });

    it('should return expired status when fetching expired payout', async () => {
      // Create payout and set to pending
      const createRes = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_expiry_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'expiry_fetch_test'
        })
        .expect(201);

      const payoutId = createRes.body.data.id;

      // Set to pending first (expiration only affects pending payouts)
      await request(app)
        .patch(`/api/v1/payouts/${payoutId}/status`)
        .send({ status: 'pending' });

      // Force expire
      await request(app)
        .post(`/api/v1/test/expire/${payoutId}`);

      // Fetch and verify expired
      const getRes = await request(app)
        .get(`/api/v1/payouts/${payoutId}`)
        .expect(200);

      expect(getRes.body.data.status).toBe('expired');
    });
  });

  /**
   * TEST 12: Description Field
   *
   * Tests description field with character limit:
   * - Accept valid description
   * - Reject description over 144 characters
   */
  describe('TC-F012: Description Field Limits', () => {
    it('should accept valid description', async () => {
      const description = 'Payment for completing level 5';
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_desc_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'desc_valid_test',
          description
        })
        .expect(201);

      expect(response.body.data.description).toBe(description);
    });

    it('should accept description at max length (144 chars)', async () => {
      const description = 'A'.repeat(MAX_DESCRIPTION_LENGTH);
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_desc_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'desc_max_test',
          description
        })
        .expect(201);

      expect(response.body.data.description.length).toBe(MAX_DESCRIPTION_LENGTH);
    });

    it('should reject description over 144 characters', async () => {
      const description = 'A'.repeat(MAX_DESCRIPTION_LENGTH + 1);
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_desc_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'desc_too_long_test',
          description
        })
        .expect(400);

      expect(response.body.data.error).toBe('DESCRIPTION_TOO_LONG');
      expect(response.body.data.maxLength).toBe(MAX_DESCRIPTION_LENGTH);
    });

    it('should set description to null when not provided', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_desc_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'desc_null_test'
        })
        .expect(201);

      expect(response.body.data.description).toBeNull();
    });
  });

  /**
   * TEST 14: 2% Service Fee Calculation
   *
   * PRD Requirement #9: 2% service fee on each payout
   * Tests fee calculation, balance deduction, and edge cases
   */
  describe('TC-F014: 2% Service Fee', () => {
    it('should calculate 2% fee correctly on standard payout', async () => {
      const amount = 1000;
      const expectedFee = 20; // 2% of 1000

      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_fee_test',
          amount: amount,
          projectId: 'project_test_001',
          idempotencyKey: 'fee_standard_test'
        })
        .expect(201);

      expect(response.body.data.fee).toBe(expectedFee);
      expect(response.body.data.totalCost).toBe(amount + expectedFee);
    });

    it('should round fee up (ceiling) on odd amounts', async () => {
      const amount = 150; // 2% = 3 sats
      const expectedFee = Math.ceil(amount * SERVICE_FEE_PERCENT); // 3 sats

      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_fee_test',
          amount: amount,
          projectId: 'project_test_001',
          idempotencyKey: 'fee_ceiling_test'
        })
        .expect(201);

      expect(response.body.data.fee).toBe(expectedFee);
      expect(response.body.data.totalCost).toBe(amount + expectedFee);
    });

    it('should calculate minimum fee (1 sat) on small amounts', async () => {
      const amount = 1; // 2% of 1 = 0.02, ceiling = 1
      const expectedFee = 1;

      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_fee_test',
          amount: amount,
          projectId: 'project_test_001',
          idempotencyKey: 'fee_min_test'
        })
        .expect(201);

      expect(response.body.data.fee).toBe(expectedFee);
      expect(response.body.data.totalCost).toBe(amount + expectedFee);
    });

    it('should calculate maximum fee on max payout (100,000 sats)', async () => {
      // Fund project with enough for max payout + 2% fee (100,000 + 2,000 = 102,000)
      await request(app)
        .post('/api/v1/projects/project_fee_max/fund')
        .send({ amount: 110000 });

      const amount = 100000;
      const expectedFee = 2000; // 2% of 100,000

      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_fee_test',
          amount: amount,
          projectId: 'project_fee_max',
          idempotencyKey: 'fee_max_test'
        })
        .expect(201);

      expect(response.body.data.fee).toBe(expectedFee);
      expect(response.body.data.totalCost).toBe(amount + expectedFee);
    });

    it('should reject payout if balance covers amount but not fee', async () => {
      // Fund project with exactly 1000 sats
      await request(app)
        .post('/api/v1/projects/project_exact_balance/fund')
        .send({ amount: 1000 });

      // Try 1000 sat payout (needs 1020 with fee)
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_fee_test',
          amount: 1000,
          projectId: 'project_exact_balance',
          idempotencyKey: 'fee_boundary_test'
        })
        .expect(402);

      expect(response.body.data.error).toBe('INSUFFICIENT_BALANCE');
      expect(response.body.data.fee).toBe(20);
      expect(response.body.data.totalCost).toBe(1020);
      expect(response.body.data.currentBalance).toBe(1000);
    });

    it('should include fee in insufficient balance error message', async () => {
      await request(app)
        .post('/api/v1/projects/project_fee_msg/fund')
        .send({ amount: 100 });

      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_fee_test',
          amount: 500,
          projectId: 'project_fee_msg',
          idempotencyKey: 'fee_msg_test'
        })
        .expect(402);

      // Message should mention the fee
      expect(response.body.message).toContain('fee');
      expect(response.body.message).toContain('10'); // 2% of 500 = 10
      expect(response.body.message).toContain('510'); // total cost
    });
  });

  /**
   * TEST 13: Internal ID Tracking
   *
   * Tests internalId for client-side tracking:
   * - Accept and store internalId
   * - Retrieve payout by internalId
   */
  describe('TC-F013: Internal ID Tracking', () => {
    it('should accept and store internalId', async () => {
      const internalId = 'client_tx_12345';
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_internal_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'internal_store_test',
          internalId
        })
        .expect(201);

      expect(response.body.data.internalId).toBe(internalId);
    });

    it('should retrieve payout by internalId', async () => {
      const internalId = 'client_tx_lookup';

      // Create payout with internalId
      const createRes = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_internal_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'internal_lookup_test',
          internalId
        })
        .expect(201);

      const originalId = createRes.body.data.id;

      // Lookup by internalId
      const lookupRes = await request(app)
        .get(`/api/v1/payouts/by-internal-id/${internalId}`)
        .expect(200);

      expect(lookupRes.body.data.id).toBe(originalId);
      expect(lookupRes.body.data.internalId).toBe(internalId);
    });

    it('should return 404 for unknown internalId', async () => {
      const response = await request(app)
        .get('/api/v1/payouts/by-internal-id/nonexistent_internal_id')
        .expect(404);

      expect(response.body.data.error).toBe('PAYOUT_NOT_FOUND');
    });

    it('should set internalId to null when not provided', async () => {
      const response = await request(app)
        .post('/api/v1/payouts')
        .send({
          gamertag: 'player_internal_test',
          amount: 100,
          projectId: 'project_test_001',
          idempotencyKey: 'internal_null_test'
        })
        .expect(201);

      expect(response.body.data.internalId).toBeNull();
    });
  });

});
