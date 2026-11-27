/**
 * Pitxmail End-to-End System Test Suite
 * Validates production health, daily limits, deliverability guards, and APIs.
 */

const BASE_URL = process.env.PITXMAIL_URL || "https://mail.pitx.uk";
const SESSION_TOKEN = process.env.PITXMAIL_SESSION || "pm_sess_d7021b4e14884d4099ba7cf16d9fa6d4";

async function runTests() {
  console.log(`\n======================================================`);
  console.log(`🚀 Starting Pitxmail End-to-End System Test Suite`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`======================================================\n`);

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    process.stdout.write(`• ${name.padEnd(55)} ... `);
    try {
      await fn();
      console.log(`\x1b[32mPASS\x1b[0m`);
      passed++;
    } catch (err: any) {
      console.log(`\x1b[31mFAIL\x1b[0m`);
      console.error(`  Error: ${err.message}`);
      failed++;
    }
  }

  // Test 1: Public Health
  await test("GET /health (Edge worker responsive)", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== "ok") throw new Error(`Unexpected status: ${data.status}`);
  });

  // Test 2: Live Statistics & Resend 99 Quota
  await test("GET /api/v1/stats (Resend limit is 99, 14-day series)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/stats`, {
      headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.resendDailyLimit !== 99) {
      throw new Error(`Expected resendDailyLimit = 99, got ${data.resendDailyLimit}`);
    }
    if (!Array.isArray(data.series) || data.series.length === 0) {
      throw new Error("Missing or empty 14-day delivery series");
    }
  });

  // Test 3: Suppression List API
  await test("GET /api/v1/suppressions (Verify suppressed accounts)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/suppressions`, {
      headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const emails = (data.data || []).map((s: any) => s.email.toLowerCase());
    if (!emails.includes("ftaylor1@pitacs.com") || !emails.includes("r.pullen@pitacs.com")) {
      throw new Error(`Expected ftaylor1 and r.pullen in suppressions list, got: ${emails.join(", ")}`);
    }
  });

  // Test 4: Pre-Flight Suppression Guard (Zero-Leakage Protection)
  await test("POST /api/v1/emails (Halt suppressed recipient with 422)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SESSION_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Pitacs Orders <orders@pitx.uk>",
        to: ["ftaylor1@pitacs.com"],
        subject: "Automated Guard Test",
        text: "This message must be halted at the edge.",
      }),
    });
    if (res.status !== 422) {
      throw new Error(`Expected HTTP 422 Unprocessable Entity, got HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.error || !data.error.includes("suppressed")) {
      throw new Error(`Unexpected error message: ${JSON.stringify(data)}`);
    }
  });

  // Test 5: Server-Side Email Search
  await test("GET /api/v1/emails?q=samuel (Server-side search)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/emails?q=samuel&limit=10`, {
      headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.count === 0) throw new Error("Expected search results for 'samuel'");
  });

  // Test 6: Domains List
  await test("GET /api/v1/domains (Verified sending domains)", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/domains`, {
      headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.domains) && !Array.isArray(data.data)) {
      throw new Error("Invalid domains response format");
    }
  });

  console.log(`\n======================================================`);
  console.log(`📊 Test Results: \x1b[32m${passed} Passed\x1b[0m, \x1b[31m${failed} Failed\x1b[0m`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner encountered an unhandled exception:", err);
  process.exit(1);
});
