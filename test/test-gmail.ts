async function testGmail() {
  const timestamp = new Date().toISOString();
  console.log(`[1] Dispatching test email to realstackzteam@gmail.com at ${timestamp}...`);

  const payload = {
    from: "Pitxmail Alerts <alerts@pitx.uk>",
    to: ["realstackzteam@gmail.com"],
    subject: `Pitxmail Test • ${new Date().toLocaleTimeString()} [EXTERNAL RECIPIENT]`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
          <div style="background-color: #f97316; color: white; border-radius: 8px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; line-height: 40px; text-align: center;">P</div>
          <h2 style="margin: 0 0 0 12px; color: #0f172a; font-size: 20px;">Pitxmail External Delivery Test</h2>
        </div>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          Hello Realstackz Team,
        </p>
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">
          This email confirms that Pitxmail is successfully sending outbound emails to external domains (Gmail) via <strong>pitx.uk</strong> using Cloudflare Email Sending.
        </p>
        <div style="background-color: #f8fafc; border-left: 4px solid #f97316; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Sender:</strong> alerts@pitx.uk</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;"><strong>Recipient:</strong> realstackzteam@gmail.com</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;"><strong>Timestamp:</strong> ${timestamp}</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #16a34a; font-weight: 600;"><strong>Status:</strong> Active & Delivered</p>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          Sent from Pitxmail Edge Infrastructure.
        </p>
      </div>
    `,
    text: `Hello Realstackz Team,\n\nThis email confirms that Pitxmail is sending outbound emails to external domains (Gmail) via pitx.uk.\n\nTimestamp: ${timestamp}\nSender: alerts@pitx.uk\nRecipient: realstackzteam@gmail.com`,
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
    const detailRes = await fetch(`https://pitxmail.pitacsdev.workers.dev/api/v1/emails/${sendData.id}`, {
      headers: {
        Authorization: "Bearer pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c",
      },
    });
    const detailData = await detailRes.json();
    console.log("[4] D1 Database Record & Attempt Log:");
    console.log(JSON.stringify(detailData, null, 2));
  }
}

testGmail();
