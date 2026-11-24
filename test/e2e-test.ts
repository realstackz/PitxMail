import { initDb, db } from "../src/lib/db";
import { emailEngine } from "../src/lib/email/engine";
import { messages, deliveryAttempts } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

async function runTests() {
  console.log("=== STARTING PITXMAIL END-TO-END VERIFICATION ===");

  // 1. Initialize DB
  console.log("\n[Test 1] Initializing Database & Seed...");
  await initDb();
  console.log("✓ Database initialized with tables & default Pitacs tenant.");

  // 2. Send Successful Email
  console.log("\n[Test 2] Testing Successful Email Dispatch...");
  const sendResult1 = await emailEngine.sendEmail(
    {
      from: "Pitacs Notifications <noreply@pitacs.com>",
      to: "st@pitacs.com",
      subject: "Overtime Claim Approved - E2E Test #1",
      html: "<p>Your claim has been verified.</p>",
      text: "Your claim has been verified.",
      tags: { test: "true", suite: "e2e" },
    },
    { organisationId: "org_pitacs", projectId: "proj_pitacs_hub" }
  );

  console.log(`✓ Email sent successfully. ID: ${sendResult1.messageId}, Status: ${sendResult1.status}, Provider: ${sendResult1.provider}`);
  if (sendResult1.status !== "delivered") {
    throw new Error(`Expected status 'delivered', got '${sendResult1.status}'`);
  }

  // 3. Send Simulated Failure Email
  console.log("\n[Test 3] Testing Failure Capture...");
  const sendResultFail = await emailEngine.sendEmail(
    {
      from: "Pitacs Notifications <noreply@pitacs.com>",
      to: "test-fail@pitacs.com",
      subject: "Simulated Failure Test",
      html: "<p>Will fail to verify retry handling.</p>",
    },
    { organisationId: "org_pitacs", projectId: "proj_pitacs_hub" }
  );

  console.log(`✓ Failure captured correctly. ID: ${sendResultFail.messageId}, Status: ${sendResultFail.status}, Error: ${sendResultFail.error}`);
  if (sendResultFail.status !== "failed") {
    throw new Error(`Expected status 'failed', got '${sendResultFail.status}'`);
  }

  // 4. Test 1-Click Retry System
  console.log("\n[Test 4] Testing 1-Click Retry on Failed Email...");
  const retryResult = await emailEngine.retryEmail(sendResultFail.messageId);
  console.log(`✓ Retry completed. Success: ${retryResult.success}, New Status: ${retryResult.status}`);

  // Verify attempt log count in database
  const attempts = await db
    .select()
    .from(deliveryAttempts)
    .where(eq(deliveryAttempts.messageId, sendResultFail.messageId));
  console.log(`✓ Recorded ${attempts.length} delivery attempts for message ${sendResultFail.messageId}.`);
  if (attempts.length < 2) {
    throw new Error("Expected at least 2 delivery attempts after retry.");
  }

  // 5. Test Idempotency Guard
  console.log("\n[Test 5] Testing Idempotency Guard...");
  const idempotencyKey = `idem_${Date.now()}`;
  const firstIdemSend = await emailEngine.sendEmail(
    {
      from: "Pitacs <noreply@pitacs.com>",
      to: "accounting@pitacs.com",
      subject: "Invoice #1092 Processed",
      idempotencyKey,
    },
    { organisationId: "org_pitacs", projectId: "proj_pitacs_hub" }
  );

  const secondIdemSend = await emailEngine.sendEmail(
    {
      from: "Pitacs <noreply@pitacs.com>",
      to: "accounting@pitacs.com",
      subject: "Invoice #1092 Processed",
      idempotencyKey,
    },
    { organisationId: "org_pitacs", projectId: "proj_pitacs_hub" }
  );

  console.log(`✓ First Message ID: ${firstIdemSend.messageId}`);
  console.log(`✓ Second Message ID: ${secondIdemSend.messageId}`);
  if (firstIdemSend.messageId !== secondIdemSend.messageId) {
    throw new Error("Idempotency guard failed: returned duplicate message IDs for identical key.");
  }
  console.log("✓ Idempotency guard verified: duplicate request returned existing message without double dispatch.");

  console.log("\n=======================================================");
  console.log("🎉 ALL E2E VERIFICATION CHECKS PASSED SUCCESSFULLY!");
  console.log("=======================================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
