// The addresses of the conformance run. Every service is on this machine. `localhost.emobix.co.uk`
// resolves to 127.0.0.1 in public DNS; the suite's containers map it to the Docker host.

export const HOST = "localhost.emobix.co.uk";

/** The broker's issuer: the TLS proxy (run.ts) in front of the broker in workerd. */
export const ISSUER = `https://${HOST}:9445`;
/** The broker Worker in workerd, plain HTTP on loopback. Only the TLS proxy calls it. */
export const BROKER_PORT = 9441;
/** The fixture Worker that creates the clients (admin.ts), plain HTTP on loopback. */
export const ADMIN_PORT = 9442;

/** The fake OpenID provider of the OP plans (fake-upstream.ts), the broker's `fake` connector. */
export const FAKE_ISSUER = `https://${HOST}:9446`;
/** The client id of the broker's `fake` connector at the fake provider. */
export const FAKE_CONNECTOR_CLIENT_ID = "ibe-broker";

/** The suite. */
export const SUITE_URL = `https://${HOST}:8443`;
/** The suite's alias of the OP plans: the client's return address is under it. */
export const OP_ALIAS = "ibe-op";
/** The suite's alias of the RP plan: the issuer of the broker's `suite` connector is under it. */
export const RP_ALIAS = "ibe-rp";
export const SUITE_RP_ISSUER = `${SUITE_URL}/test/a/${RP_ALIAS}/`;
/** The client id of the broker's `suite` connector, as the RP plan's static client. */
export const SUITE_CONNECTOR_CLIENT_ID = "ibe-broker";

/**
 * The return address of the RP driver's client. Nothing listens there: the driver reads the
 * broker's redirect and does not follow it.
 */
export const RP_DRIVER_REDIRECT_URI = `https://${HOST}:9447/callback`;
