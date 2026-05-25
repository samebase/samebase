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

    return Response.redirect(targetUrl, 302);
  },
};

function isSupportedHostname(hostname: string) {
  const parts = hostname.split(".");

  if (parts.length !== 3) {
    return false;
  }

  const [label, secondLevel, topLevel] = parts;
  const zone = `${secondLevel}.${topLevel}`;

  return supportedZones.has(zone) && isSupportedLabel(label);
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
