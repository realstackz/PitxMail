export interface SendEmailRequest {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

export interface OutboundEmailPayload {
  id: string;
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface DeliveryResult {
  status: "delivered" | "submitted" | "failed";
  provider: string;
  providerMessageId?: string;
  errorReason?: string;
  retryable?: boolean;
  rawResponse?: string;
}

export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  send(payload: OutboundEmailPayload): Promise<DeliveryResult>;
}
