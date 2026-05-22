# rsvp deploy manifests

Starting point for deploying rsvp to the nottingham-cloud k3s cluster.

## Files

| File | Purpose |
| --- | --- |
| `namespace.yaml` | Creates the `rsvp` namespace. |
| `pvc.yaml` | Persistent volume claim against `nfs-nottinghamvault` (Retain). Mounted at `/data` for SQLite + uploads. |
| `service.yaml` | ClusterIP service on port 80 → pod port 8088. |
| `deployment.yaml` | Single-replica `Recreate`-strategy deployment. Loads secrets from a `rsvp-secrets` Secret (not in this folder). |
| `secret.example.yaml` | **Template only** - real secret comes from Bitwarden via the infra agent's configure step. |
| `kustomization.yaml` | Bundles the above (excluding the secret template). |

## Upgrade story

- **Strategy: `Recreate`** - the old pod stops fully before the new one starts. SQLite is single-writer; two pods sharing `/data/rsvp.db` would corrupt. Brief (~5-10s) downtime per deploy is the tradeoff.
- **PVC reclaim: Retain** - `kubectl delete pvc rsvp-data` does NOT wipe the data on the NAS. Cleanup is manual.
- **Schema migrations: idempotent** - `ensureSchema` on every startup adds any missing columns via `ALTER TABLE ADD COLUMN`. Safe to run repeatedly. New columns added to `internal/db/migrations/001_init.sql` should also be listed in `internal/db/ensure.go` so existing databases catch up.
- **Graceful shutdown** - the Go process traps SIGTERM, drains in-flight HTTP requests via `srv.Shutdown`, then closes the SQLite WAL via `defer store.Close()`. `terminationGracePeriodSeconds: 30` gives enough room.
- **WAL mode** - enabled at `db.Open` so a `kill -9` mid-transaction is recoverable on the next start.

## Required Bitwarden item

Item name: `rsvp`. Fields:

| Field | Value |
| --- | --- |
| `management-password` | the shared password for `/manage`. Whatever you'll type in. |
| `session-secret` | generate with `openssl rand -hex 32`. Rotating this invalidates all in-flight management sessions. |

The infra agent's configure step pulls both into the `rsvp-secrets` Secret in the `rsvp` namespace.

## Routing

Caddy + the local Cloudflare Tunnel front everything. After applying the manifests:

```sh
cd k3s
make route-add HOSTNAME=rsvp.fisher.sh SERVICE=http://rsvp.rsvp.svc.cluster.local:80
```

`/manage` is gated at the app layer by the shared password, so the tunnel route does NOT need to be put behind auth.fisher.sh forward-auth.
