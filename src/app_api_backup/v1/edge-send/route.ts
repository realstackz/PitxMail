import { NextRequest, NextResponse } from "next/server";

// Server-side proxy so the production API key never reaches the browser.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch("https://pitxmail.pitacsdev.workers.dev/api/v1/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PITXMAIL_API_KEY || ""}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to reach Cloudflare edge" }, { status: 502 });
  }
}
