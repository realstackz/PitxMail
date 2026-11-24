async function sendTest() {
  const payload = {
    from: "Pitxmail <noreply@pitacs.com>",
    to: "standoh@pitacs.com",
    subject: "Welcome to Pitxmail — Cloudflare Email Infrastructure Active",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
        <div style="display: flex; align-items: center; margin-bottom: 24px;">
          <span style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">⚡ Pitxmail</span>
          <span style="margin-left: 10px; font-size: 11px; padding: 2px 8px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border-radius: 4px; border: 1px solid rgba(59, 130, 246, 0.3); font-weight: 600;">Pitacs Native</span>
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 12px 0;">Your Email Delivery Infrastructure is Live!</h2>
        <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px 0;">
          Hello Seth,
        </p>
        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.6; margin: 0 0 20px 0;">
          This is an automated test dispatch from <strong>Pitxmail</strong> sent to <strong>standoh@pitacs.com</strong>.
        </p>
        <div style="background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">DISPATCH SPECIFICATIONS</div>
          <div style="font-size: 13px; color: #f1f5f9; font-family: monospace; line-height: 1.8;">
            • <strong>Recipient:</strong> standoh@pitacs.com<br/>
            • <strong>Engine:</strong> Cloudflare-Native Edge Router<br/>
            • <strong>Status:</strong> Delivered / Accepted<br/>
            • <strong>Platform:</strong> Pitacs Hub Ecosystem<br/>
            • <strong>Cost:</strong> $0 external service subscription
          </div>
        </div>
        <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0 0 20px 0;">
          You can inspect this message, review its headers, and test the 1-click retry system anytime at your local dashboard: <a href="http://localhost:3000/emails" style="color: #3b82f6; text-decoration: none;">http://localhost:3000/emails</a>.
        </p>
        <div style="border-top: 1px solid #1e293b; padding-top: 16px; font-size: 11px; color: #64748b; margin-top: 24px;">
          Pitacs Ltd · Digital Transformation Lab · Pmail Project
        </div>
      </div>
    `,
    text: "Hello Seth, This is an automated test dispatch from Pitxmail to standoh@pitacs.com. Your Cloudflare email infrastructure is active!",
    tags: { recipient: "standoh", env: "production", priority: "high" },
  };

  const res = await fetch("http://localhost:3000/api/v1/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer pm_live_default_pitacs_key_2026",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log("RESPONSE_STATUS:", res.status);
  console.log("RESPONSE_DATA:", JSON.stringify(data, null, 2));
}

sendTest().catch(console.error);
