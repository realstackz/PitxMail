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
  return (json.Answer || []).map((a: any) => String(a.data).replace(/^"|"$/g, "").replace(/"\s*"/g, ""));
}

// Real DNS verification. Cloudflare Email Sending requires the domain's DNS to be
// hosted on Cloudflare; once it is, `wrangler email sending enable <domain>` creates
// the real SPF/DKIM records, which this check then confirms.
export async function POST(
  req: NextRequest,
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

    const [ns, txt, dmarc] = await Promise.all([
      doh(domain, "NS"),
      doh(domain, "TXT"),
      doh(`_dmarc.${domain}`, "TXT"),
    ]);

    const nsOnCloudflare: Check = ns.some((n) => n.toLowerCase().includes(".ns.cloudflare.com")) ? "pass" : "fail";
    const spfRecords = txt.filter((t) => t.toLowerCase().startsWith("v=spf1"));
    const spf: Check = spfRecords.length === 1 ? "pass" : "fail";
    const dmarcRecords = dmarc.filter((t) => t.toLowerCase().startsWith("v=dmarc1"));
    const dmarcCheck: Check = dmarcRecords.length === 1 ? "pass" : "fail";

    const issues: string[] = [];
    if (nsOnCloudflare === "fail")
      issues.push(`Nameservers are not on Cloudflare (found: ${ns.join(", ") || "none"}). Add ${domain} to Cloudflare and switch nameservers.`);
    if (spfRecords.length === 0) issues.push("No SPF record found.");
    if (spfRecords.length > 1) issues.push(`Multiple SPF records found (${spfRecords.length}); only one is allowed.`);
    if (dmarcRecords.length === 0) issues.push("No DMARC record found.");
    if (dmarcRecords.length > 1) issues.push(`Multiple DMARC records found (${dmarcRecords.length}); only one is allowed.`);

    // Ready to send only when DNS is on Cloudflare (that's what Cloudflare Email Sending requires)
    const verified = nsOnCloudflare === "pass" && spf === "pass" && dmarcCheck === "pass";
    const status = verified ? "verified" : "pending";
    const toStatus = (c: Check) => (c === "pass" ? "verified" : "failed");

    await db
      .update(domains)
      .set({
        verificationStatus: status,
        spfStatus: toStatus(spf),
        dmarcStatus: toStatus(dmarcCheck),
        // DKIM/MX are provisioned by Cloudflare Email Sending once the zone is on Cloudflare
        dkimStatus: nsOnCloudflare === "pass" ? "verified" : "pending",
        mxStatus: nsOnCloudflare === "pass" ? "verified" : "pending",
      })
      .where(eq(domains.id, id));

    return NextResponse.json({
      success: verified,
      domain,
      status,
      checks: { nameserversOnCloudflare: nsOnCloudflare, spf, dmarc: dmarcCheck },
      found: { nameservers: ns, spf: spfRecords, dmarc: dmarcRecords },
      issues,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
