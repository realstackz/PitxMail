import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await fetch(
      `https://pitxmail.pitacsdev.workers.dev/api/v1/emails/${encodeURIComponent(id)}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PITXMAIL_API_KEY || ""}`,
        },
        cache: "no-store",
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `Edge returned ${res.status}` }, { status: res.status });
    }
    const json: any = await res.json();
    const m = json.message || {};
    const message = {
      id: m.id,
      fromAddress: m.from_address || m.fromAddress,
      fromName: m.from_name || m.fromName,
      toAddress: m.to_address || m.toAddress,
      subject: m.subject,
      htmlBody: m.html_body || m.htmlBody,
      textBody: m.text_body || m.textBody,
      status: m.status,
      provider: m.provider,
      errorReason: m.error_reason || m.errorReason,
      retryCount: m.retry_count ?? 0,
      createdAt: m.created_at || m.createdAt,
      updatedAt: m.updated_at || m.updatedAt,
      isRemote: true,
    };
    const attempts = (json.attempts || []).map((a: any) => ({
      id: a.id,
      attemptNumber: a.attempt_number ?? a.attemptNumber,
      provider: a.provider,
      status: a.status,
      errorMessage: a.error_message ?? a.errorMessage,
      startedAt: a.started_at ?? a.startedAt,
      finishedAt: a.finished_at ?? a.finishedAt,
    }));
    return NextResponse.json({ message, attempts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
