async function sendLiveCloudflareTest() {
  const payload = {
    from: "Pitxmail <noreply@pitxmail.pitacsdev.workers.dev>",
    to: "standoh@pitacs.com",
    subject: "Live Cloudflare Worker Dispatch — pitxmail.pitacsdev.workers.dev",
    html: `
      <div style="font-family: sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #1e293b; background: #0f172a; color: #f8fafc; border-radius: 8px;">
        <h2 style="color: #60a5fa; margin-top: 0;">⚡ Live Cloudflare Edge Dispatch</h2>
        <p style="color: #cbd5e1;">This message was routed directly through the live Cloudflare Worker endpoint:</p>
        <p style="font-family: monospace; color: #38bdf8;">https://pitxmail.pitacsdev.workers.dev</p>
        <div style="background: #020617; padding: 14px; border-radius: 6px; font-family: monospace; font-size: 13px; margin: 16px 0;">
          Status: Accepted & Recorded in D1<br/>
          Recipient: standoh@pitacs.com<br/>
          Database: pitxmail-db (Cloudflare D1)<br/>
          Time: ${new Date().toISOString()}
        </div>
      </div>
    `,
    text: "Live Cloudflare Worker Dispatch to standoh@pitacs.com from pitxmail.pitacsdev.workers.dev",
  };

  const res = await fetch("https://pitxmail.pitacsdev.workers.dev/api/v1/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("STATUS:", res.status);
  console.log("DATA:", JSON.stringify(data, null, 2));
}

sendLiveCloudflareTest().catch(console.error);
