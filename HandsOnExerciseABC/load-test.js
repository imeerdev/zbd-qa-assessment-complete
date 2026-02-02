/**
 * Load Test for ZBD-Style Payment API
 * Tool: k6 (Grafana k6)
 *
 * ZBD TERMINOLOGY:
 * - projectId: The ZBD project identifier (API key scope)
 * - gamertag: The recipient's ZBD gamertag
 *
 * Simulates real-world gaming reward scenarios:
 * - High volume small payouts (game rewards)
 * - Concurrent gamertags from multiple ZBD projects
 * - Callback/webhook delivery under load
 * - Rate limiting behavior
 * - Balance consistency
 *
 * Run: k6 run load-test.js
 * Run specific scenario: k6 run --env SCENARIO=gaming load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const payoutSuccessRate = new Rate('payout_success_rate');
const payoutDuration = new Trend('payout_duration');
const rateLimitHits = new Counter('rate_limit_hits');
const insufficientBalanceErrors = new Counter('insufficient_balance_errors');
const callbacksTriggered = new Counter('callbacks_triggered');
const expiredPayouts = new Counter('expired_payouts');
const validationErrors = new Counter('validation_errors');
const serverErrors = new Counter('server_errors');
const duplicateRequests = new Counter('duplicate_requests');
const totalFeesCollected = new Counter('total_fees_collected');
const timeoutErrors = new Counter('timeout_errors');
const balanceRollbackFailures = new Counter('balance_rollback_failures');

// Service fee constant (must match payment-api.js)
const SERVICE_FEE_PERCENT = 0.02; // 2% service fee

// Determine which scenario to run based on environment variable
const selectedScenario = __ENV.SCENARIO || 'all';

// Define scenario configurations
const allScenarios = {
  // Default: Gaming reward simulation
  gaming_rewards: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },   // Warm up
      { duration: '1m', target: 50 },    // Normal load
      { duration: '2m', target: 50 },    // Sustained load
      { duration: '30s', target: 100 },  // Peak load (game event)
      { duration: '1m', target: 100 },   // Sustained peak
      { duration: '30s', target: 0 },    // Cool down
    ],
    gracefulRampDown: '10s',
  },
  // Rate limit stress test - runs in parallel
  rate_limit_stress: {
    executor: 'per-vu-iterations',
    vus: 5,
    iterations: 1,
    startTime: '30s',  // Start after warm-up
    exec: 'rateLimitStressTest',
  },
  // Duplicate detection test
  duplicate_detection: {
    executor: 'shared-iterations',
    vus: 10,
    iterations: 50,
    startTime: '1m',  // Start after ramp-up begins
    exec: 'concurrentDuplicateTest',
  },
  // Expiration flow test
  expiration_test: {
    executor: 'per-vu-iterations',
    vus: 5,
    iterations: 2,
    startTime: '2m',  // Mid-test
    exec: 'expirationFlowTest',
  },
  // Callback verification
  callback_test: {
    executor: 'per-vu-iterations',
    vus: 5,
    iterations: 2,
    startTime: '3m',  // Later in test
    exec: 'callbackVerificationTest',
  },
};

// Chaos testing scenario - runs separately to avoid affecting other tests
// Uses a single VU to ensure accurate balance validation without concurrency noise
const chaosScenarios = {
  timeout_recovery: {
    executor: 'per-vu-iterations',
    vus: 1,           // Single VU for accurate balance tracking
    iterations: 20,   // More iterations to ensure chaos injection triggers
    exec: 'timeoutRecoveryTest',
  },
};

// Select scenarios based on SCENARIO env var
let activeScenarios;
let activeThresholds;

if (selectedScenario === 'timeout_recovery') {
  // Run ONLY the chaos testing scenario
  activeScenarios = chaosScenarios;
  activeThresholds = {
    'balance_rollback_failures': ['count==0'],  // Zero tolerance - balance MUST be restored on timeout
    'timeout_errors': ['count>0'],              // Ensure chaos injection is working
    'http_req_failed': ['rate<0.6'],            // Higher tolerance for chaos testing (50% timeouts expected)
  };
} else {
  // Run all standard scenarios (no chaos testing)
  activeScenarios = allScenarios;
  activeThresholds = {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],  // 95% under 500ms, 99% under 1s
    'payout_success_rate': ['rate>0.7'],               // At least 70% success
    'http_req_failed': ['rate<0.3'],                   // Less than 30% failure rate
    'server_errors': ['count<10'],                     // Less than 10 server errors
    'payout_duration': ['p(95)<500'],                  // Custom metric threshold
  };
}

// Load test configuration
export const options = {
  scenarios: activeScenarios,
  thresholds: activeThresholds,
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

// Generate unique IDs
function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Game reward descriptions (realistic for ZBD gaming use case)
const REWARD_DESCRIPTIONS = [
  'Level completion bonus',
  'Daily login reward',
  'Achievement unlocked',
  'Tournament prize',
  'Referral bonus',
  'In-game purchase cashback',
  'Streak bonus reward',
  'Boss defeated reward',
  'Quest completion',
  'Leaderboard prize',
];

function getRandomDescription() {
  return REWARD_DESCRIPTIONS[Math.floor(Math.random() * REWARD_DESCRIPTIONS.length)];
}

// Setup: Fund ZBD project accounts (game studios)
export function setup() {
  console.log('Setting up load test environment...');

  // Health check before starting
  const healthResponse = http.get(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    throw new Error(`API health check failed! Status: ${healthResponse.status}. Make sure the API is running on ${BASE_URL}`);
  }
  console.log('✓ API health check passed');

  // Reset state
  http.del(`${BASE_URL}/api/v1/test/reset`);

  // Fund multiple ZBD project accounts
  const projectIds = [];
  const gameProjects = [
    'project_arcade_games',
    'project_puzzle_masters',
    'project_action_studio',
    'project_rpg_world',
    'project_casual_fun',
    'project_esports_arena',
    'project_indie_games',
    'project_mobile_hits',
    'project_vr_studio',
    'project_retro_games',
  ];

  gameProjects.forEach(projectId => {
    projectIds.push(projectId);
    const response = http.post(
      `${BASE_URL}/api/v1/projects/${projectId}/fund`,
      JSON.stringify({ amount: 1000000 }), // 1M sats per project
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (response.status === 200) {
      const body = JSON.parse(response.body);
      console.log(`Funded ${projectId}: ${body.data.newBalance} sats`);
    }
  });

  return { projectIds };
}

/**
 * Main Scenario: Gaming Reward Payouts
 * Simulates gamertags receiving Bitcoin rewards in games
 */
export default function(data) {
  const gamertag = `player_${__VU}_${__ITER}`;
  const projectId = data.projectIds[__VU % data.projectIds.length];

  // Typical game reward amounts (10-500 sats)
  const amount = Math.floor(Math.random() * 490) + 10;
  const idempotencyKey = generateId();
  const internalId = `game_tx_${generateId()}`;

  group('Create Payout', function() {
    const payload = JSON.stringify({
      gamertag,
      amount,
      projectId,
      idempotencyKey,
      internalId,
      description: getRandomDescription(),
      callbackUrl: 'https://game-server.example.com/webhook',
      expiresIn: 600, // 10 minutes for gamertag to claim
    });

    const params = {
      headers: { 'Content-Type': 'application/json' },
    };

    const startTime = Date.now();
    const response = http.post(`${BASE_URL}/api/v1/payouts`, payload, params);
    const duration = Date.now() - startTime;

    payoutDuration.add(duration);

    // Check response is valid (one of expected statuses)
    const isExpectedStatus = check(response, {
      'response status is expected (201, 200, 429, or 402)': (r) =>
        [201, 200, 429, 402].includes(r.status),
      'no server errors (5xx)': (r) => r.status < 500,
      'response has success field': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success !== undefined;
        } catch (e) {
          return false;
        }
      },
      'response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    // Conditional checks based on status code
    if (response.status === 201 || response.status === 200) {
      check(response, {
        'success response has data.id': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data && body.data.id !== undefined;
          } catch (e) {
            return false;
          }
        },
      });

      if (response.status === 201) {
        check(response, {
          'created response has matching internalId': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.data && body.data.internalId === internalId;
            } catch (e) {
              return false;
            }
          },
          'response includes 2% service fee': (r) => {
            try {
              const body = JSON.parse(r.body);
              const expectedFee = Math.ceil(body.data.amount * SERVICE_FEE_PERCENT);
              return body.data.fee === expectedFee;
            } catch (e) {
              return false;
            }
          },
          'response includes totalCost (amount + fee)': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.data.totalCost === body.data.amount + body.data.fee;
            } catch (e) {
              return false;
            }
          },
        });

        // Track fees collected
        try {
          const body = JSON.parse(response.body);
          if (body.data && body.data.fee) {
            totalFeesCollected.add(body.data.fee);
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }

    // Track metrics based on status code
    switch (response.status) {
      case 201:
        payoutSuccessRate.add(1);
        callbacksTriggered.add(1); // Callback sent on create
        break;
      case 200:
        payoutSuccessRate.add(1);
        duplicateRequests.add(1);
        break;
      case 429:
        payoutSuccessRate.add(0);
        rateLimitHits.add(1);
        break;
      case 402:
        payoutSuccessRate.add(0);
        insufficientBalanceErrors.add(1);
        break;
      case 400:
        payoutSuccessRate.add(0);
        validationErrors.add(1);
        break;
      default:
        payoutSuccessRate.add(0);
        if (response.status >= 500) {
          serverErrors.add(1);
        }
    }
  });

  // Simulate player think time (playing game between rewards)
  sleep(Math.random() * 2 + 0.5);
}

/**
 * Teardown: Verify data consistency
 */
export function teardown(data) {
  console.log('\n========================================');
  console.log('Load test completed. Verifying results...');
  console.log('========================================\n');

  // Check each project's balance
  let totalRemaining = 0;
  let inconsistencies = 0;

  data.projectIds.forEach(projectId => {
    const response = http.get(`${BASE_URL}/api/v1/projects/${projectId}/balance`);
    if (response.status === 200) {
      const body = JSON.parse(response.body);
      const balance = body.data.balance;
      totalRemaining += balance;

      if (balance < 0) {
        console.error(`ERROR: ${projectId} has negative balance: ${balance}`);
        inconsistencies++;
      } else {
        console.log(`${projectId}: ${balance.toLocaleString()} sats remaining`);
      }
    }
  });

  console.log('\n----------------------------------------');
  console.log(`Total remaining balance: ${totalRemaining.toLocaleString()} sats`);
  console.log(`Total funded: 10,000,000 sats`);
  const totalSpent = 10000000 - totalRemaining;
  console.log(`Total spent (payouts + 2% fees): ${totalSpent.toLocaleString()} sats`);
  console.log(`Note: Total spent includes 2% service fee on each payout`);

  if (inconsistencies === 0) {
    console.log('\n✓ All project balances are valid (non-negative)');
  } else {
    console.error(`\n✗ Found ${inconsistencies} balance inconsistencies!`);
  }

  // Check callback log
  const callbackResponse = http.get(`${BASE_URL}/api/v1/test/callbacks`);
  if (callbackResponse.status === 200) {
    const body = JSON.parse(callbackResponse.body);
    console.log(`\n✓ Total callbacks logged: ${body.data.count}`);
  }
}

/**
 * Scenario: Concurrent Duplicate Detection
 * Tests idempotency under high concurrency (same key from multiple requests)
 */
export function concurrentDuplicateTest() {
  const sharedIdempotencyKey = `duplicate_test_${Date.now()}`;
  const gamertag = 'player_duplicate_test';
  const projectId = 'project_arcade_games';

  const payload = JSON.stringify({
    gamertag,
    amount: 100,
    projectId,
    idempotencyKey: sharedIdempotencyKey,
    description: 'Duplicate detection test',
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const response = http.post(`${BASE_URL}/api/v1/payouts`, payload, params);

  check(response, {
    'status is 201 or 200': (r) => r.status === 201 || r.status === 200,
    'response indicates success': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true;
      } catch (e) {
        return false;
      }
    },
    'duplicate returns same payout id': (r) => {
      if (r.status === 200) {
        try {
          const body = JSON.parse(r.body);
          return body.message.includes('duplicate') || body.message.includes('already processed');
        } catch (e) {
          return false;
        }
      }
      return true;
    },
  });

  sleep(0.1);
}

/**
 * Scenario: Rate Limit Stress Test
 * Rapidly sends requests from same gamertag to test rate limiting
 */
export function rateLimitStressTest() {
  const gamertag = `rate_stress_player_${__VU}`;
  const projectId = 'project_esports_arena';

  console.log(`Starting rate limit test for ${gamertag}...`);

  // Try to make 15 requests rapidly (should hit rate limit at 11th)
  let successCount = 0;
  let rateLimitedCount = 0;

  for (let i = 0; i < 15; i++) {
    const payload = JSON.stringify({
      gamertag,
      amount: 50,
      projectId,
      idempotencyKey: `rate_stress_${__VU}_${i}_${Date.now()}`,
      description: `Rate test ${i + 1}`,
    });

    const response = http.post(`${BASE_URL}/api/v1/payouts`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.status === 201) {
      successCount++;
    } else if (response.status === 429) {
      rateLimitedCount++;

      // Verify rate limit response format
      check(response, {
        'rate limit has correct error': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data.error === 'RATE_LIMIT_EXCEEDED';
          } catch (e) {
            return false;
          }
        },
        'rate limit has retryAfter': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data.retryAfter > 0;
          } catch (e) {
            return false;
          }
        },
      });
    }
  }

  check(null, {
    'exactly 10 requests succeeded': () => successCount === 10,
    'remaining requests rate limited': () => rateLimitedCount === 5,
  });

  console.log(`Rate test complete: ${successCount} succeeded, ${rateLimitedCount} rate limited`);
}

/**
 * Scenario: Expiration Flow Test
 * Tests payout expiration workflow
 */
export function expirationFlowTest() {
  const gamertag = `expiry_test_player_${__VU}`;
  const projectId = 'project_casual_fun';

  group('Create payout with short expiry', function() {
    const payload = JSON.stringify({
      gamertag,
      amount: 100,
      projectId,
      idempotencyKey: `expiry_test_${generateId()}`,
      description: 'Expiration test payout',
      expiresIn: 60, // 1 minute expiry
    });

    const response = http.post(`${BASE_URL}/api/v1/payouts`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    check(response, {
      'payout created': (r) => r.status === 201,
      'has expiresAt field': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data.expiresAt !== undefined;
        } catch (e) {
          return false;
        }
      },
      'expiresIn is 60 seconds': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data.expiresIn === 60;
        } catch (e) {
          return false;
        }
      },
    });

    if (response.status === 201) {
      const body = JSON.parse(response.body);
      const payoutId = body.data.id;

      // Force expire for testing
      const expireResponse = http.post(`${BASE_URL}/api/v1/test/expire/${payoutId}`);

      check(expireResponse, {
        'payout expired successfully': (r) => r.status === 200,
        'status is expired': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data.status === 'expired';
          } catch (e) {
            return false;
          }
        },
      });

      if (expireResponse.status === 200) {
        expiredPayouts.add(1);
      }
    }
  });

  sleep(0.5);
}

/**
 * Scenario: Callback Verification Test
 * Verifies callbacks are logged correctly
 */
export function callbackVerificationTest() {
  const gamertag = `callback_test_player_${__VU}`;
  const projectId = 'project_mobile_hits';
  const callbackUrl = `https://game-${__VU}.example.com/webhook`;

  group('Create payout with callback', function() {
    const payload = JSON.stringify({
      gamertag,
      amount: 200,
      projectId,
      idempotencyKey: `callback_test_${generateId()}`,
      description: 'Callback verification test',
      callbackUrl,
    });

    const response = http.post(`${BASE_URL}/api/v1/payouts`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    check(response, {
      'payout created': (r) => r.status === 201,
      'callbackUrl stored': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data.callbackUrl === callbackUrl;
        } catch (e) {
          return false;
        }
      },
    });

    if (response.status === 201) {
      // Verify callback was logged
      sleep(0.1); // Small delay for callback processing

      const callbackLogResponse = http.get(`${BASE_URL}/api/v1/test/callbacks`);
      check(callbackLogResponse, {
        'callback log accessible': (r) => r.status === 200,
        'callbacks logged': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data.count > 0;
          } catch (e) {
            return false;
          }
        },
      });
    }
  });

  sleep(0.5);
}

/**
 * Scenario: Timeout Recovery Test (Chaos Testing)
 * Tests balance rollback when Lightning Network times out after charge
 *
 * This validates the FIX for the critical bug scenario:
 * - User is charged (balance deducted)
 * - Lightning payment times out
 * - Verify balance is properly rolled back (FIX MUST BE WORKING)
 *
 * NOTE: rollbackOnTimeout is set to TRUE to verify the fix works.
 * To expose the bug, set rollbackOnTimeout to false.
 */
export function timeoutRecoveryTest() {
  const projectId = 'project_retro_games';

  group('Timeout recovery test', function() {
    // Step 1: Enable failure injection on EVERY iteration (idempotent operation)
    // This ensures failure injection is active regardless of VU execution order
    const enableResponse = http.post(
      `${BASE_URL}/api/v1/test/failure-injection`,
      JSON.stringify({
        enabled: true,
        timeoutRate: 0.5,          // 50% timeout rate for testing
        rollbackOnTimeout: true    // Enable rollback - verifies the fix works
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    check(enableResponse, {
      'failure injection enabled': (r) => r.status === 200,
    });

    // Step 2: Get initial balance (atomic read before the payout attempt)
    const balanceBefore = http.get(`${BASE_URL}/api/v1/projects/${projectId}/balance`);
    let initialBalance = 0;
    if (balanceBefore.status === 200) {
      try {
        initialBalance = JSON.parse(balanceBefore.body).data.balance;
      } catch (e) {
        console.log(`VU${__VU}: Failed to parse initial balance`);
        return;
      }
    } else {
      console.log(`VU${__VU}: Failed to get initial balance, status: ${balanceBefore.status}`);
      return;
    }

    // Step 3: Attempt payout (may timeout due to 50% failure injection)
    const gamertag = `timeout_test_player_${__VU}_${__ITER}`;
    const amount = 500;
    const fee = Math.ceil(amount * SERVICE_FEE_PERCENT);
    const totalCost = amount + fee;

    const payload = JSON.stringify({
      gamertag,
      amount,
      projectId,
      idempotencyKey: `timeout_test_${generateId()}`,
      description: 'Timeout recovery test',
    });

    const payoutResponse = http.post(`${BASE_URL}/api/v1/payouts`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    });

    // Step 4: Immediately get balance after the payout attempt
    const balanceAfter = http.get(`${BASE_URL}/api/v1/projects/${projectId}/balance`);
    let finalBalance = 0;
    if (balanceAfter.status === 200) {
      try {
        finalBalance = JSON.parse(balanceAfter.body).data.balance;
      } catch (e) {
        console.log(`VU${__VU}: Failed to parse final balance`);
      }
    }

    // Step 5: Analyze the result based on response status
    if (payoutResponse.status === 504) {
      // TIMEOUT occurred - balance MUST be restored
      timeoutErrors.add(1);

      // Verify balance was restored (allowing for concurrent operations)
      // With rollbackOnTimeout: true, the balance should match initial
      const balanceRestored = check(null, {
        'balance restored after timeout': () => finalBalance === initialBalance,
      });

      if (!balanceRestored) {
        balanceRollbackFailures.add(1);
        console.log(`BUG DETECTED [VU${__VU}]: Balance not rolled back! Before: ${initialBalance}, After: ${finalBalance}, Lost: ${initialBalance - finalBalance} sats`);
      }
    } else if (payoutResponse.status === 201) {
      // Success - balance should be reduced by totalCost
      payoutSuccessRate.add(1);

      // Note: Can't reliably check exact balance due to concurrent VUs
      // Just track that payout succeeded
    } else if (payoutResponse.status === 402) {
      // Insufficient balance - expected during concurrent testing
      insufficientBalanceErrors.add(1);
    } else if (payoutResponse.status === 429) {
      // Rate limited - expected during concurrent testing
      rateLimitHits.add(1);
    } else {
      // Unexpected status
      serverErrors.add(1);
      console.log(`VU${__VU}: Unexpected response status: ${payoutResponse.status}`);
    }

  });

  // Disable failure injection after last iteration (iter 19 for 20 iterations)
  if (__ITER === 19) {
    sleep(0.3);
    http.post(
      `${BASE_URL}/api/v1/test/failure-injection`,
      JSON.stringify({ enabled: false }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  sleep(0.2);
}
