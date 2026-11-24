import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit") || "50";
    const cfUrl = `https://pitxmail.pitacsdev.workers.dev/api/v1/emails?limit=${limit}`;

    const res = await fetch(cfUrl, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PITXMAIL_API_KEY || ""}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Cloudflare edge returned ${res.status}` }, { status: res.status });
    }

    const json = await res.json();

    // Normalize field names to match Next.js schema (to_address -> toAddress)
    const normalizedData = (json.data || []).map((m: any) => ({
      id: m.id,
      fromAddress: m.from_address || m.fromAddress,
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
    }));

    return NextResponse.json({
      data: normalizedData,
      count: normalizedData.length,
      source: "cloudflare_d1_remote",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to reach Cloudflare edge" }, { status: 500 });
  }
}
