async function run() {
  try {
    const res = await fetch("https://pitxmail.pitacsdev.workers.dev/api/v1/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c",
      },
      body: JSON.stringify({
        from: "Pitxmail <noreply@pitx.uk>",
        to: ["standoh@pitacs.com"],
        subject: "Welcome to Pitxmail - Cloudflare Email Routing Active!",
        html: "<h1>Success! 🎉</h1><p>Your custom domain <strong>pitx.uk</strong> is now fully configured on Cloudflare with MX, SPF, and DKIM.</p><p>Sent from Pitxmail on Cloudflare Workers & D1.</p>",
        text: "Success! Your custom domain pitx.uk is now fully configured on Cloudflare with MX, SPF, and DKIM. Sent from Pitxmail.",
      }),
    });

    const status = res.status;
    const body = await res.text();
    console.log("STATUS:", status);
    console.log("RESPONSE:", body);
  } catch (err: any) {
    console.error("ERROR:", err);
  }
}

run();
