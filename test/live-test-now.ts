async function runTest() {
  const timestamp = new Date().toISOString();
  console.log(`[1] Dispatching test email at ${timestamp}...`);

  const payload = {
    from: "Pitxmail Live Test <alerts@pitx.uk>",
    to: ["standoh@pitacs.com"],
    subject: `Live Test Dispatch • ${new Date().toLocaleTimeString()} [VERIFIED]`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
          <div style="background-color: #f97316; color: white; border-radius: 8px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; line-height: 40px; text-align: center;">P</div>
          <h2 style="margin: 0 0 0 12px; color: #0f172a; font-size: 20px;">Pitxmail Live Delivery Test</h2>
        </div>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          Hello Standoh,
        </p>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          This email confirms that your custom domain <strong>pitx.uk</strong> is successfully routed through <strong>Cloudflare Email Sending</strong> and our edge worker on <strong>pitxmail.pitacsdev.workers.dev</strong>.
        </p>
        <div style="background-color: #f8fafc; border-left: 4px solid #f97316; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Sender:</strong> alerts@pitx.uk</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;"><strong>Recipient:</strong> standoh@pitacs.com</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;"><strong>Timestamp:</strong> ${timestamp}</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #16a34a; font-weight: 600;"><strong>Status:</strong> Active & Verified</p>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          Pitacs Technology Hub • Built with Next.js, Cloudflare Workers & D1.
        </p>
      </div>
    `,
    text: `Hello Standoh,\n\nThis email confirms that your custom domain pitx.uk is successfully routed through Cloudflare Email Sending and our edge worker.\n\nTimestamp: ${timestamp}\nStatus: Active & Verified\n\nPitacs Technology Hub`,
  };

  const startTime = Date.now();
  const sendRes = await fetch("https://pitxmail.pitacsdev.workers.dev/api/v1/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c",
    },
    body: JSON.stringify(payload),
  });

  const durationMs = Date.now() - startTime;
  const sendData = await sendRes.json();
  console.log(`[2] HTTP Status: ${sendRes.status} (${durationMs}ms)`);
  console.log("[3] Send Response:", JSON.stringify(sendData, null, 2));

  if (sendData.id) {
    console.log(`[4] Fetching stored message details for ${sendData.id} from D1...`);
    const detailRes = await fetch(`https://pitxmail.pitacsdev.workers.dev/api/v1/emails/${sendData.id}`, {
      headers: {
        Authorization: "Bearer pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c",
      },
    });
    const detailData = await detailRes.json();
    console.log("[5] D1 Database Record & Attempt Log:");
    console.log(JSON.stringify(detailData, null, 2));
  }
}

runTest();
