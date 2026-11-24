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

    // Required DNS records template
    const dnsRecords = [
      {
        type: "TXT",
        name: rawDomain,
        value: "v=spf1 include:_spf.mx.cloudflare.net ~all",
        status: "pending",
        record: "SPF",
      },
      {
        type: "TXT",
        name: `cf._domainkey.${rawDomain}`,
        value: `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3${crypto.randomBytes(16).toString("hex")}`,
        status: "pending",
        record: "DKIM",
      },
      {
        type: "TXT",
        name: `_dmarc.${rawDomain}`,
        value: `v=DMARC1; p=none; rua=mailto:dmarc@${rawDomain}`,
        status: "pending",
        record: "DMARC",
      },
      {
        type: "MX",
        name: rawDomain,
        value: "route1.mx.cloudflare.net",
        priority: 10,
        status: "pending",
        record: "MX",
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
