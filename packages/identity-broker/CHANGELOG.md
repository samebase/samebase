# Changelog

## 0.12.1

- Fix the package import in Node. 0.12.0 stops with `ERR_MODULE_NOT_FOUND` outside a Convex bundle.

## 0.12.0

- Add Convex team and Cloudflare API authorization through RFC 6749 authorization code, S256 PKCE,
  and RFC 8707 resource indicators. Sign-in keeps its existing OIDC contract.
- Add confidential-client refresh grants with upstream rotation and RFC 7009 revocation. API grants
  stay in the private broker component and create no users.
- Restrict API resources to first-party apps. Bind requests to the browser and client, and stop
  grants when their client is deleted.
