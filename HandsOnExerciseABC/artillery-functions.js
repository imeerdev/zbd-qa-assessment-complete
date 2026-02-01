/**
 * Artillery.io Helper Functions
 * Custom JavaScript for load test data generation
 *
 * ZBD-Style Payment API
 * - Uses gamertag (not userId)
 * - Uses projectId (not developerId)
 * - All payouts include 2% service fee
 */

function generatePayoutData(context, events, done) {
  // Generate unique gamertag (ZBD terminology)
  context.vars.gamertag = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Random amount between 100-2000 sats
  // Note: Actual cost will be amount + 2% fee (e.g., 1000 sats + 20 fee = 1020 total)
  context.vars.amount = Math.floor(Math.random() * 1900) + 100;

  // Unique idempotency key
  context.vars.idempotencyKey = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return done();
}

module.exports = {
  generatePayoutData
};
