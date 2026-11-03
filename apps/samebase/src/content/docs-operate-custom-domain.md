# Operate: custom domain

Samebase does not manage domains. The site is in your own Convex or Cloudflare account, so you
attach the domain there.

## A site on Convex

A custom domain needs the Convex Pro plan. In the deployment's settings, open **Custom Domains** and
add the domain with **HTTP Actions** as the destination. Then create the `CNAME` and `TXT` records
that Convex shows. The
[convex-hosting domain guide](https://github.com/samebase/convex-hosting/blob/main/docs/domains.md)
covers apex domains, Cloudflare DNS, and moving a domain from another host.

## A Cloudflare Worker

Open the Worker in Cloudflare, then **Settings**, **Domains & Routes**, **Add**, **Custom domain**.
Alchemy does not track this domain, so attach it again if the stack ever rebuilds the Worker.
