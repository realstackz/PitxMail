"use client";

import { useState } from "react";
import { X, Copy, Check, Code, Terminal } from "lucide-react";

interface ApiDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  emailId?: string;
}

export function ApiDrawer({ isOpen, onClose, emailId }: ApiDrawerProps) {
  const [lang, setLang] = useState<"curl" | "node" | "python" | "go">("curl");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const getSnippets = () => {
    if (emailId) {
      return {
        curl: `curl -X GET https://mail.pitx.uk/api/v1/emails/${emailId} \\
  -H "Authorization: Bearer <PITXMAIL_API_KEY>"`,
        node: `const res = await fetch("https://mail.pitx.uk/api/v1/emails/${emailId}", {
  headers: {
    "Authorization": "Bearer " + process.env.PITXMAIL_API_KEY
  }
});
const data = await res.json();
console.log(data.message, data.attempts);`,
        python: `import os, requests

res = requests.get(
    "https://mail.pitx.uk/api/v1/emails/${emailId}",
    headers={"Authorization": f"Bearer {os.environ.get('PITXMAIL_API_KEY')}"}
)
print(res.json())`,
        go: `req, _ := http.NewRequest("GET", "https://mail.pitx.uk/api/v1/emails/${emailId}", nil)
req.Header.Set("Authorization", "Bearer " + os.Getenv("PITXMAIL_API_KEY"))
res, _ := http.DefaultClient.Do(req)`,
      };
    }

    return {
      curl: `curl -X POST https://mail.pitx.uk/api/v1/emails \\
  -H "Authorization: Bearer <PITXMAIL_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "Pitacs Hub <noreply@pitacs.pitx.uk>",
    "to": ["recipient@example.com"],
    "subject": "Hello from Pitxmail",
    "html": "<h1>Welcome</h1><p>Transactional delivery on edge.</p>"
  }'`,
      node: `const res = await fetch("https://mail.pitx.uk/api/v1/emails", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.PITXMAIL_API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    from: "Pitacs Hub <noreply@pitacs.pitx.uk>",
    to: ["recipient@example.com"],
    subject: "Hello from Pitxmail",
    html: "<h1>Welcome</h1>"
  })
});
const email = await res.json();`,
      python: `import os, requests

res = requests.post(
    "https://mail.pitx.uk/api/v1/emails",
    headers={
        "Authorization": f"Bearer {os.environ.get('PITXMAIL_API_KEY')}",
        "Content-Type": "application/json"
    },
    json={
        "from": "Pitacs Hub <noreply@pitacs.pitx.uk>",
        "to": ["recipient@example.com"],
        "subject": "Hello from Pitxmail",
        "html": "<h1>Welcome</h1>"
    }
)
print(res.json())`,
      go: `payload := []byte(\`{
  "from": "Pitacs Hub <noreply@pitacs.pitx.uk>",
  "to": ["recipient@example.com"],
  "subject": "Hello",
  "html": "<p>Content</p>"
}\`)
req, _ := http.NewRequest("POST", "https://mail.pitx.uk/api/v1/emails", bytes.NewBuffer(payload))
req.Header.Set("Authorization", "Bearer " + os.Getenv("PITXMAIL_API_KEY"))
req.Header.Set("Content-Type", "application/json")
res, _ := http.DefaultClient.Do(req)`,
    };
  };

  const code = getSnippets()[lang];

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-black border-l border-neutral-800 p-6 flex flex-col h-full shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white">
              <Code className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">API Request Drawer</h2>
              <p className="text-[11px] text-neutral-400">Ready-to-use snippets for your services</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Language Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1 p-1 bg-neutral-900 border border-neutral-800 rounded-lg text-xs">
            {(["curl", "node", "python", "go"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-1 rounded-md capitalize transition font-medium ${
                  lang === l
                    ? "bg-white text-black font-semibold shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                {l === "curl" ? "cURL" : l === "node" ? "Node.js" : l === "python" ? "Python" : "Go"}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-xs text-white transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>

        {/* Code Box */}
        <div className="flex-1 bg-neutral-950 border border-neutral-800/80 rounded-xl p-4 font-mono text-xs text-neutral-200 overflow-x-auto whitespace-pre leading-relaxed select-all">
          {code}
        </div>

        {/* Footer info */}
        <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-900 text-[11px] text-neutral-400 space-y-1">
          <div className="font-semibold text-neutral-300">Base URL: https://mail.pitx.uk/api/v1</div>
          <p>
            Authenticated with Bearer token. Generate keys in the{" "}
            <a href="/api-keys" className="text-white underline underline-offset-2">
              API Keys section
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
