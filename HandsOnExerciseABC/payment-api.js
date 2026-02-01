/**
 * Mock Payment API Server (ZBD-Style)
 * Simulates a Bitcoin rewards payout API matching ZBD's format
 *
 * API FORMAT:
 * - All responses use: { success: boolean, data: {...}, message: string }
 * - Amounts in satoshis (sats)
 * - Authentication via 'apikey' header
 *
 * ZBD TERMINOLOGY:
 * - projectId: The ZBD project identifier (API key scope)
 * - gamertag: The recipient's ZBD gamertag
 *
 * ============================================================
 * KNOWN BUGS (Intentionally included to demonstrate testing)
 * ============================================================
 *
 * BUG-001: Line ~95 - Zero amount validation
 *   - `!amount` treats 0 as falsy, returning VALIDATION_ERROR
 *   - Should return INVALID_AMOUNT for amount=0
 *
 * BUG-004: Line ~130 - Unknown project handling
 *   - Unknown projectId defaults to balance=0, returns INSUFFICIENT_BALANCE
 *   - Should return PROJECT_NOT_FOUND for unknown projects
 *
 * BUG-005: Lines ~110 - Idempotency key scope
 *   - Idempotency key is global, not scoped to projectId
 *   - Project A and Project B using same key would conflict
 *
 * BUG-006: Line ~230 - Implicit project creation
 *   - Fund endpoint creates new projects implicitly
 *   - Should validate project exists first
 * ============================================================
 */

const express = require('express');
const app = express();
app.use(express.json());

// Simple API key auth middleware
const API_KEY = 'test_api_key_12345';
const requireAuth = (req, res, next) => {
  const apiKey = req.headers['apikey'];
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or missing API key'
    });
  }
  next();
};

// In-memory storage
const payouts = new Map();
const rateLimits = new Map();
const projectBalances = new Map();
const callbackLog = []; // Stores callback attempts for testing

// Failure injection for chaos testing
let failureInjection = {
  enabled: false,
  timeoutRate: 0.05,      // 5% of requests timeout after charge
  rollbackOnTimeout: true // If false, exposes the "charged but not paid" bug
};

// Constants
const MAX_DESCRIPTION_LENGTH = 144;
const DEFAULT_EXPIRY_SECONDS = 300; // 5 minutes
const SERVICE_FEE_PERCENT = 0.02; // 2% service fee on each payout

/**
 * PAYOUT STATUS VALUES
 * All possible status values for payouts/invoices
 */
const PAYOUT_STATUS = {
  PENDING: 'pending',       // Payment initiated, awaiting confirmation
  COMPLETED: 'completed',   // Payment successfully delivered
  EXPIRED: 'expired',       // Payment window expired (not claimed)
  ERROR: 'error'            // Payment failed due to error
};

// Export for tests
const VALID_STATUSES = Object.values(PAYOUT_STATUS);

// Initialize test project
projectBalances.set('project_test_001', 100000); // 100k sats

// Helper: Generate unique ID
const generateId = () => `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Helper: Check rate limit (10 per hour per gamertag)
const checkRateLimit = (gamertag) => {
  const key = `rate_${gamertag}`;
  const now = Date.now();
  const windowStart = now - 3600000; // 1 hour ago

  if (!rateLimits.has(key)) {
    rateLimits.set(key, []);
  }

  const timestamps = rateLimits.get(key).filter(t => t > windowStart);
  rateLimits.set(key, timestamps);

  return timestamps.length;
};

// Helper: Add rate limit entry
const addRateLimit = (gamertag) => {
  const key = `rate_${gamertag}`;
  if (!rateLimits.has(key)) {
    rateLimits.set(key, []);
  }
  rateLimits.get(key).push(Date.now());
};

// Helper: Simulate network delay
const simulateDelay = () => {
  const delay = Math.random() * 100 + 50; // 50-150ms
  return new Promise(resolve => setTimeout(resolve, delay));
};

// Helper: Send callback (mock - logs instead of actual HTTP call)
const sendCallback = (url, payout) => {
  const callbackPayload = {
    event: 'payout.status_changed',
    timestamp: new Date().toISOString(),
    data: payout
  };
  callbackLog.push({
    url,
    payload: callbackPayload,
    sentAt: new Date().toISOString()
  });
  // In real implementation, would do: fetch(url, { method: 'POST', body: JSON.stringify(callbackPayload) })
};

// Helper: Check if payout is expired
const isExpired = (payout) => {
  if (!payout.expiresAt) return false;
  return new Date(payout.expiresAt) < new Date();
};

/**
 * POST /api/v1/payouts
 * Create a new payout (ZBD-style response format)
 *
 * Supports:
 * - callbackUrl: URL to receive status updates
 * - expiresIn: Seconds until payout expires (default 300)
 * - description: Optional description (max 144 chars)
 * - internalId: Client-provided tracking ID
 */
app.post('/api/v1/payouts', async (req, res) => {
  await simulateDelay();

  const {
    gamertag,
    amount,
    projectId,
    idempotencyKey,
    callbackUrl,
    expiresIn,
    description,
    internalId
  } = req.body;

  // Validation (BUG-001: !amount treats 0 as falsy)
  if (!gamertag || !amount || !projectId) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: gamertag, amount, projectId',
      data: { error: 'VALIDATION_ERROR' }
    });
  }

  if (amount < 1 || amount > 100000) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be between 1 and 100,000 sats',
      data: { error: 'INVALID_AMOUNT' }
    });
  }

  // Validate description length
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH} characters`,
      data: { error: 'DESCRIPTION_TOO_LONG', maxLength: MAX_DESCRIPTION_LENGTH }
    });
  }

  // Validate callbackUrl format
  if (callbackUrl && !callbackUrl.match(/^https?:\/\/.+/)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid callback URL format. Must start with http:// or https://',
      data: { error: 'INVALID_CALLBACK_URL' }
    });
  }

  // Check idempotency (BUG-005: not scoped to projectId)
  if (idempotencyKey) {
    const existing = Array.from(payouts.values()).find(
      p => p.idempotencyKey === idempotencyKey
    );
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Payout already processed (duplicate request)',
        data: existing
      });
    }
  }

  // Check rate limit
  const currentCount = checkRateLimit(gamertag);
  if (currentCount >= 10) {
    return res.status(429).json({
      success: false,
      message: 'Maximum 10 payouts per gamertag per hour',
      data: { error: 'RATE_LIMIT_EXCEEDED', retryAfter: 3600 }
    });
  }

  // Check project balance (BUG-004: unknown project defaults to 0)
  const balance = projectBalances.get(projectId) || 0;

  // Calculate 2% service fee
  const fee = Math.ceil(amount * SERVICE_FEE_PERCENT);
  const totalCost = amount + fee;

  if (balance < totalCost) {
    return res.status(402).json({
      success: false,
      message: `Project balance (${balance} sats) insufficient for payout (${amount} sats + ${fee} sats fee = ${totalCost} sats total)`,
      data: {
        error: 'INSUFFICIENT_BALANCE',
        requiredAmount: amount,
        fee: fee,
        totalCost: totalCost,
        currentBalance: balance
      }
    });
  }

  // Calculate expiration
  const expirySeconds = expiresIn || DEFAULT_EXPIRY_SECONDS;
  const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();

  // Create payout
  const payoutId = generateId();
  const payout = {
    id: payoutId,
    internalId: internalId || null,
    gamertag,
    amount,
    fee,
    totalCost,
    projectId,
    idempotencyKey,
    description: description || null,
    callbackUrl: callbackUrl || null,
    status: 'completed',
    expiresIn: expirySeconds,
    expiresAt,
    createdAt: new Date().toISOString()
  };

  // Deduct balance (amount + fee)
  projectBalances.set(projectId, balance - totalCost);

  // FAILURE INJECTION: Simulate Lightning Network timeout after charge
  if (failureInjection.enabled && Math.random() < failureInjection.timeoutRate) {
    // Simulate network delay before timeout
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (failureInjection.rollbackOnTimeout) {
      // Proper behavior: rollback the charge
      projectBalances.set(projectId, balance);
    }
    // If rollbackOnTimeout is false, balance remains deducted (the bug!)

    return res.status(504).json({
      success: false,
      message: 'Payment gateway timeout - Lightning Network unavailable',
      data: {
        error: 'GATEWAY_TIMEOUT',
        chargedAmount: totalCost,
        balanceRolledBack: failureInjection.rollbackOnTimeout
      }
    });
  }

  // Store payout
  payouts.set(payoutId, payout);

  // Add to rate limit
  addRateLimit(gamertag);

  // Send callback if URL provided
  if (callbackUrl) {
    sendCallback(callbackUrl, payout);
  }

  res.status(201).json({
    success: true,
    message: 'Payout created successfully',
    data: payout
  });
});

/**
 * GET /api/v1/payouts/:id
 * Get payout by ID (checks expiration)
 */
app.get('/api/v1/payouts/:id', async (req, res) => {
  await simulateDelay();

  const payout = payouts.get(req.params.id);
  if (!payout) {
    return res.status(404).json({
      success: false,
      message: 'Payout not found',
      data: { error: 'PAYOUT_NOT_FOUND' }
    });
  }

  // Check if expired and update status
  if (isExpired(payout) && payout.status === 'pending') {
    payout.status = 'expired';
    payout.updatedAt = new Date().toISOString();
    if (payout.callbackUrl) {
      sendCallback(payout.callbackUrl, payout);
    }
  }

  res.json({
    success: true,
    message: 'Payout retrieved',
    data: payout
  });
});

/**
 * GET /api/v1/projects/:id/balance
 * Get project balance (like ZBD's /v0/wallet)
 */
app.get('/api/v1/projects/:id/balance', async (req, res) => {
  await simulateDelay();

  const balance = projectBalances.get(req.params.id);
  if (balance === undefined) {
    return res.status(404).json({
      success: false,
      message: 'Project not found',
      data: { error: 'PROJECT_NOT_FOUND' }
    });
  }

  res.json({
    success: true,
    message: 'Balance retrieved',
    data: {
      projectId: req.params.id,
      balance,
      currency: 'sats'
    }
  });
});

/**
 * POST /api/v1/projects/:id/fund
 * Add funds to project account (test only)
 * BUG-006: Creates projects implicitly instead of validating
 */
app.post('/api/v1/projects/:id/fund', async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount < 1) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be positive',
      data: { error: 'INVALID_AMOUNT' }
    });
  }

  // BUG-006: Should check if project exists first
  const currentBalance = projectBalances.get(req.params.id) || 0;
  const newBalance = currentBalance + amount;
  projectBalances.set(req.params.id, newBalance);

  res.json({
    success: true,
    message: 'Funds added successfully',
    data: {
      projectId: req.params.id,
      previousBalance: currentBalance,
      addedAmount: amount,
      newBalance
    }
  });
});

/**
 * DELETE /api/v1/test/reset
 * Reset all data (test endpoint)
 */
app.delete('/api/v1/test/reset', (req, res) => {
  payouts.clear();
  rateLimits.clear();
  projectBalances.clear();
  callbackLog.length = 0; // Clear callback log
  projectBalances.set('project_test_001', 100000);

  res.json({
    success: true,
    message: 'All data reset',
    data: {}
  });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    data: { status: 'healthy', timestamp: new Date().toISOString() }
  });
});

/**
 * GET /api/v1/statuses
 * Returns all valid payout status values
 */
app.get('/api/v1/statuses', (req, res) => {
  res.json({
    success: true,
    message: 'Valid payout statuses',
    data: {
      statuses: VALID_STATUSES,
      descriptions: {
        pending: 'Payment initiated, awaiting confirmation',
        completed: 'Payment successfully delivered',
        expired: 'Payment window expired (not claimed)',
        error: 'Payment failed due to error'
      }
    }
  });
});

/**
 * PATCH /api/v1/payouts/:id/status
 * Update payout status (test endpoint for simulating status changes)
 */
app.patch('/api/v1/payouts/:id/status', async (req, res) => {
  const { status } = req.body;
  const payout = payouts.get(req.params.id);

  if (!payout) {
    return res.status(404).json({
      success: false,
      message: 'Payout not found',
      data: { error: 'PAYOUT_NOT_FOUND' }
    });
  }

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      data: { error: 'INVALID_STATUS', validStatuses: VALID_STATUSES }
    });
  }

  payout.status = status;
  payout.updatedAt = new Date().toISOString();

  // Send callback if URL provided
  if (payout.callbackUrl) {
    sendCallback(payout.callbackUrl, payout);
  }

  res.json({
    success: true,
    message: `Payout status updated to ${status}`,
    data: payout
  });
});

/**
 * GET /api/v1/test/callbacks
 * Get callback log (test endpoint)
 */
app.get('/api/v1/test/callbacks', (req, res) => {
  res.json({
    success: true,
    message: 'Callback log retrieved',
    data: {
      callbacks: callbackLog,
      count: callbackLog.length
    }
  });
});

/**
 * POST /api/v1/test/failure-injection
 * Enable/disable failure injection for chaos testing
 *
 * Body:
 * - enabled: boolean - Enable/disable failure injection
 * - timeoutRate: number - Percentage of requests that timeout (0.0-1.0)
 * - rollbackOnTimeout: boolean - If true, balance is restored on timeout
 *                                If false, exposes "charged but not paid" bug
 */
app.post('/api/v1/test/failure-injection', (req, res) => {
  const { enabled, timeoutRate, rollbackOnTimeout } = req.body;

  if (typeof enabled === 'boolean') {
    failureInjection.enabled = enabled;
  }
  if (typeof timeoutRate === 'number') {
    failureInjection.timeoutRate = Math.max(0, Math.min(1, timeoutRate));
  }
  if (typeof rollbackOnTimeout === 'boolean') {
    failureInjection.rollbackOnTimeout = rollbackOnTimeout;
  }

  res.json({
    success: true,
    message: 'Failure injection settings updated',
    data: failureInjection
  });
});

/**
 * GET /api/v1/test/failure-injection
 * Get current failure injection settings
 */
app.get('/api/v1/test/failure-injection', (req, res) => {
  res.json({
    success: true,
    data: failureInjection
  });
});

/**
 * POST /api/v1/test/expire/:id
 * Force expire a payout (test endpoint)
 */
app.post('/api/v1/test/expire/:id', (req, res) => {
  const payout = payouts.get(req.params.id);

  if (!payout) {
    return res.status(404).json({
      success: false,
      message: 'Payout not found',
      data: { error: 'PAYOUT_NOT_FOUND' }
    });
  }

  // Set expiry to past
  payout.expiresAt = new Date(Date.now() - 1000).toISOString();
  payout.status = 'expired';
  payout.updatedAt = new Date().toISOString();

  if (payout.callbackUrl) {
    sendCallback(payout.callbackUrl, payout);
  }

  res.json({
    success: true,
    message: 'Payout expired',
    data: payout
  });
});

/**
 * GET /api/v1/payouts/:id/by-internal-id
 * Get payout by internalId
 */
app.get('/api/v1/payouts/by-internal-id/:internalId', async (req, res) => {
  await simulateDelay();

  const payout = Array.from(payouts.values()).find(
    p => p.internalId === req.params.internalId
  );

  if (!payout) {
    return res.status(404).json({
      success: false,
      message: 'Payout not found',
      data: { error: 'PAYOUT_NOT_FOUND' }
    });
  }

  res.json({
    success: true,
    message: 'Payout retrieved',
    data: payout
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Payment API running on port ${PORT}`);
});

module.exports = {
  app,
  server,
  PAYOUT_STATUS,
  VALID_STATUSES,
  MAX_DESCRIPTION_LENGTH,
  DEFAULT_EXPIRY_SECONDS,
  SERVICE_FEE_PERCENT
};
