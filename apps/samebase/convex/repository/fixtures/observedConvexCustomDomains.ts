/**
The reply of the Convex Management API `GET /v1/deployments/clear-butterfly-858/custom_domains` for
the production deployment of samebase/samebase, recorded on 2026-10-25. Two domains serve the site:
`samebase.com` and the older `api.samebase.com`, which serves the HTTP actions of the app.
*/
export const observedCustomDomainsReply = {
  domains: [
    {
      creationTime: 1792480436268,
      deploymentName: "clear-butterfly-858",
      requestDestination: "convexSite",
      domain: "samebase.com",
      verificationTime: 1792916590178,
    },
    {
      creationTime: 1781967760551,
      deploymentName: "clear-butterfly-858",
      requestDestination: "convexCloud",
      domain: "cloud.samebase.com",
      verificationTime: 1792916743520,
    },
    {
      creationTime: 1781967607502,
      deploymentName: "clear-butterfly-858",
      requestDestination: "convexSite",
      domain: "api.samebase.com",
      verificationTime: 1792916739149,
    },
  ],
};
