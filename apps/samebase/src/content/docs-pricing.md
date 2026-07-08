# Pricing

Creating an app is free, and the free tier is permanent. Samebase should be the standard way to
start an idea, so starting one never costs money.

## What stays free

The standard flow is computationally cheap, so it can stay free: create an app, import repositories,
provision Convex and Cloudflare, wire builds and deploy keys, watch it from the dashboard, and run
the same actions from a coding agent over MCP.

Samebase never resells your infrastructure. The code lives in your GitHub, the backend in your
Convex team, the Worker in your Cloudflare account. The providers bill you directly, and a small app
fits their free tiers ([Do it yourself](/docs/do-it-yourself)).

## What will cost money

Scale: more apps, with more branches, mirrored and updated all the time. The feature that carries
that cost is FileView, the collaborative editor over your repository's files. It mirrors the
repository into Samebase so files open instantly on any device, several people can type in the same
file live, and pull requests can be reviewed in place. The mirror and the live editing stream are
what cost money.

FileView will be metered, and the ambition is to bill compute as exactly as it can be measured.
Samebase is early and that metering does not exist yet, so today everything is free. There is no
price list: no tiers, no placeholder numbers. When prices exist, they will be published with the
receipts that justify them, like every other claim in these docs.

## The leaving test still applies

Pricing never becomes lock-in: deleting your Samebase account does not stop your app
([the leaving test](/docs/receipts#ownership-the-leaving-test)).
