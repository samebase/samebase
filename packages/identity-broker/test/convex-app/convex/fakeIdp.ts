// Where the test on a real backend serves the fake OpenID provider: its issuer as the hub knows it
// (the issuer of `fakeOidcUpstream` in src/core/testing/harness.ts), and the loopback port that
// takes the hub's requests to it.
export const FAKE_IDP_ISSUER = "https://server.example.com";
export const FAKE_IDP_PORT = 9561;
