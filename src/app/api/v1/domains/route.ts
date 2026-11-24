import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { domains } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import crypto from "crypto";

export async function GET() {
  try {
    await initDb();
    const domainList = await db
      .select()
      .from(domains)
      .orderBy(desc(domains.createdAt));

    return NextResponse.json({ domains: domainList });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const body = await req.json();
    const rawDomain = body.domain?.trim().toLowerCase();

    if (!rawDomain || !rawDomain.includes(".")) {
      return NextResponse.json(
        { error: "Invalid domain name. Example: notifications.pitacs.com" },
        { status: 400 }
      );
    }

    const domainId = `dom_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const now = Date.now();

    // Cloudflare Email Sending requires the domain's DNS to be hosted on Cloudflare.
    // Once it is, `wrangler email sending enable <domain>` creates the real SPF/DKIM/DMARC
    // records automatically, so we don't hand out made-up values here.
    const dnsRecords = [
      {
        type: "NS",
        name: rawDomain,
        value: "Your two Cloudflare nameservers (*.ns.cloudflare.com), shown when you add the domain in the Cloudflare dashboard",
        status: "pending",
        record: "Nameservers",
      },
      {
        type: "TXT",
        name: rawDomain,
        value: "SPF: created automatically by Cloudflare Email Sending",
        status: "pending",
        record: "SPF",
      },
      {
        type: "TXT",
        name: `cf2024-1._domainkey.${rawDomain}`,
        value: "DKIM: created automatically by Cloudflare Email Sending",
        status: "pending",
        record: "DKIM",
      },
      {
        type: "TXT",
        name: `_dmarc.${rawDomain}`,
        value: "DMARC: exactly one record (Cloudflare can create it; remove any duplicates)",
        status: "pending",
        record: "DMARC",
      },
    ];

    await db.insert(domains).values({
      id: domainId,
      organisationId: "org_pitacs",
      domain: rawDomain,
      verificationStatus: "pending",
      dkimStatus: "pending",
      spfStatus: "pending",
      dmarcStatus: "pending",
      mxStatus: "pending",
      dnsRecords: JSON.stringify(dnsRecords),
      createdAt: now,
    });

    return NextResponse.json({
      id: domainId,
      domain: rawDomain,
      status: "pending",
      records: dnsRecords,
    });
  } catch (err: any) {
    if (err.message?.includes("UNIQUE")) {
      return NextResponse.json({ error: "Domain already added" }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
