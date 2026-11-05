import * as P from "./old/broker-protocol-before-bc8a2a9.ts";
const base = "client_id=app&redirect_uri=https://app.example/cb&response_type=code&scope=openid&code_challenge=" + "a".repeat(43) + "&code_challenge_method=S256";
for (const extra of ["", "&max_age=", "&state=", "&nonce="]) {
  const p = new URLSearchParams(base + extra); const r: any = P.validateAuthorizeRest(p, { clientId: "app", redirectUri: "x" });
  console.log(JSON.stringify(extra || "(none)").padEnd(12), "maxAge:", r.value?.maxAge, " state:", JSON.stringify(r.value?.state), " nonce:", JSON.stringify(r.value?.nonce));
}
