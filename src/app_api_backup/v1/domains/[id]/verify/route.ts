import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { domains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type Check = "pass" | "fail";

async function doh(name: string, type: string): Promise<string[]> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { accept: "application/dns-json" }, cache: "no-store" }
  );
  if (!res.ok) return [];
  const json: any = await res.json();
  return (json.Answer || []).map((a: any) =>
    String(a.data)
      .replace(/^"|"$/g, "")
      .replace(/"\s*"/g, "")
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDb();
    const { id } = await params;
    const rows = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }
    const domain = rows[0].domain;

    const [ns, txt, dkim, dmarc, mx] = await Promise.all([
      doh(domain, "NS"),
      doh(domain, "TXT"),
      doh(`cf2024-1._domainkey.${domain}`, "TXT"),
      doh(`_dmarc.${domain}`, "TXT"),
      doh(domain, "MX"),
    ]);

    const nsOnCloudflare: Check = ns.some((n) => n.toLowerCase().includes(".ns.cloudflare.com"))
      ? "pass"
      : "fail";
    const spfRecords = txt.filter((t) => t.toLowerCase().startsWith("v=spf1"));
    const spf: Check =
      spfRecords.length === 1 && spfRecords[0].includes("_spf.mx.cloudflare.net") ? "pass" : "fail";
    const dkimRecords = dkim.filter((t) => t.toLowerCase().includes("v=dkim1"));
    const dkimCheck: Check = dkimRecords.length >= 1 ? "pass" : "fail";
    const dmarcRecords = dmarc.filter((t) => t.toLowerCase().startsWith("v=dmarc1"));
    const dmarcCheck: Check = dmarcRecords.length === 1 ? "pass" : "fail";
    const mxCheck: Check = mx.some((m) => m.toLowerCase().includes(".mx.cloudflare.net"))
      ? "pass"
      : "fail";

    const issues: string[] = [];
    if (nsOnCloudflare === "fail")
      issues.push(
        `Nameservers are not on Cloudflare (found: ${ns.join(", ") || "none"}).`
      );
    if (spf === "fail")
      issues.push(
        `Missing Cloudflare SPF record ("v=spf1 include:_spf.mx.cloudflare.net ~all"). Click "Add records and enable" in Cloudflare Email Service.`
      );
    if (dkimCheck === "fail")
      issues.push(
        `Missing Cloudflare DKIM record at cf2024-1._domainkey.${domain}. Click "Add records and enable" in Cloudflare Email Service.`
      );
    if (dmarcRecords.length === 0) issues.push("No DMARC record found.");
    if (dmarcRecords.length > 1)
      issues.push(`Multiple DMARC records found (${dmarcRecords.length}); only one is allowed.`);
    if (mxCheck === "fail")
      issues.push("Missing Cloudflare MX records (route1/route2/route3.mx.cloudflare.net).");

    const verified =
      nsOnCloudflare === "pass" &&
      spf === "pass" &&
      dkimCheck === "pass" &&
      dmarcCheck === "pass" &&
      mxCheck === "pass";
    const status = verified ? "verified" : "pending";
    const toStatus = (c: Check) => (c === "pass" ? "verified" : "failed");

    await db
      .update(domains)
      .set({
        verificationStatus: status,
        spfStatus: toStatus(spf),
        dkimStatus: toStatus(dkimCheck),
        dmarcStatus: toStatus(dmarcCheck),
        mxStatus: toStatus(mxCheck),
      })
      .where(eq(domains.id, id));

    return NextResponse.json({
      success: verified,
      domain,
      status,
      checks: {
        nameserversOnCloudflare: nsOnCloudflare,
        spf,
        dkim: dkimCheck,
        dmarc: dmarcCheck,
        mx: mxCheck,
      },
      found: { nameservers: ns, spf: spfRecords, dkim: dkimRecords, dmarc: dmarcRecords, mx },
      issues,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
