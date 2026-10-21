# Runtime base moved to distroless static-debian13

**Date:** 2026-10-21
**Type:** infra
**Version:** v0.1.1
**Author:** claude-code

## What changed

The runtime stage now builds on `gcr.io/distroless/static-debian13:nonroot` instead of
`static-debian12:nonroot`. Nothing else in the image changed.

## Why

On 2026-10-20 an eMudhra intermediate CA was compromised and the eMudhra ECC roots were
distrusted. This app makes outbound TLS calls through the image's
`/etc/ssl/certs/ca-certificates.crt`, so the bundle has to drop those roots. The
`static-debian12` images have not been rebuilt since 2026-08-21 and are deprecated
upstream, so a plain rebuild would have shipped the same bundle. `static-debian13`
carries the updated `ca-certificates`: checked before release against the 12 known
compromised chains, debian12 trusts 12/12 and debian13 trusts 0/12.

## Related

- fisherevans/nottingham-cloud#800 (eMudhra CA response)
