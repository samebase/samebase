const approvedHosts: Record<string, string> = {
  "nicu.json.md": "https://example.com",
  "nicu.xml.md": "https://example.com",
  // "alice.json.md": "https://example.com",
  // "alice.xml.md": "https://example.com",
};

const supportedZones = new Set(["json.md", "xml.md"]);

export default {
  fetch(request: Request) {
    const requestUrl = new URL(request.url);
    const hostname = requestUrl.hostname.toLowerCase();

    if (!isSupportedHostname(hostname)) {
      return notFound();
    }

    const targetBase = approvedHosts[hostname];

    if (!targetBase) {
      return notFound();
    }

    const targetUrl = new URL(requestUrl.pathname + requestUrl.search, targetBase);

    return Response.redirect(targetUrl.href, 302);
  },
};

// One label in front of a supported zone: the zone has exactly one dot, and the
// label pattern has none, so "a.b.json.md" fails on the zone lookup.
function isSupportedHostname(hostname: string) {
  const dot = hostname.indexOf(".");

  if (dot === -1) {
    return false;
  }

  return supportedZones.has(hostname.slice(dot + 1)) && isSupportedLabel(hostname.slice(0, dot));
}

function isSupportedLabel(label: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}

function notFound() {
  return new Response("Not registered\n", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
