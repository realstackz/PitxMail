async function verify() {
  const res = await fetch("https://pitxmail.pitacsdev.workers.dev/api/v1/emails/pm_cf_1795529238833_p0gvmy", {
    headers: {
      Authorization: "Bearer pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c",
    },
  });
  const data = await res.json();
  console.log("STATUS:", res.status);
  console.log(JSON.stringify(data, null, 2));
}

verify();
