import { EmailProvider, OutboundEmailPayload, DeliveryResult } from "../types";

export class MockProvider implements EmailProvider {
  readonly name = "mock";

  isConfigured(): boolean {
    return true; // Always ready as a safe fallback for dev / testing
  }

  async send(payload: OutboundEmailPayload): Promise<DeliveryResult> {
    const mockId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // If recipient email contains "fail" or "error", simulate failure to test retry mechanism
    const shouldSimulateFailure = payload.to.some((addr) =>
      addr.toLowerCase().includes("fail") || addr.toLowerCase().includes("error")
    );

    if (shouldSimulateFailure) {
      return {
        status: "failed",
        provider: this.name,
        errorReason: "Simulated delivery failure (recipient address triggers test failure rule)",
        retryable: true,
        rawResponse: JSON.stringify({ code: "SIMULATED_FAILURE", address: payload.to }),
      };
    }

    console.log(`[Pitxmail Mock Delivery] Email sent to: ${payload.to.join(", ")} | Subject: "${payload.subject}"`);

    return {
      status: "delivered",
      provider: this.name,
      providerMessageId: mockId,
      rawResponse: JSON.stringify({ success: true, timestamp: new Date().toISOString() }),
    };
  }
}
