# CYVX Vault

A dependency-free, mobile-first collectible ownership control plane built for Node.js 22.5+.

## Production loop

Inventory intake → pack construction → commitment publication → checkout → transactional allocation → ownership vault → wallet buyback or shipment → append-only audit verification.

## Safety boundary

Paid randomized packs are disabled by default. Free claims and wallet-credit transactions work locally. Do not set `PAID_PACKS_ENABLED=true` until qualified legal counsel and the payment provider approve the exact product, jurisdictions, disclosures, refund policy, age controls, and fulfillment model.

## Core guarantees

- Physical inventory is registered before publication.
- Published pack contents and the server-seed hash are committed with SHA-256.
- Allocation occurs server-side inside an immediate SQLite transaction.
- Every ownership receives a receipt with commitment hash, client seed, nonce, pool hash, and draw digest.
- The server seed is revealed when a pool closes.
- Audit events form a hash-linked append-only chain.
- Idempotency keys prevent duplicate orders.
- Buybacks return wallet credit at the configured transparent basis-point rate.
- Shipment requests move through an operator fulfillment queue.

## Run

```bash
./run.sh
```

Open `http://127.0.0.1:8789`. The initial operator credentials are printed and stored with owner-only permissions in `data/admin-credentials.txt`.

## Verify

```bash
./verify.sh
```

## Stripe activation

The integration creates Checkout Sessions, verifies webhook signatures against the raw request body, and reconciles successful sessions before allocation. Configure HTTPS, `PUBLIC_ORIGIN`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`; register `/webhooks/stripe`; then enable paid packs only after approval.

## Backups

Stop the service, then copy `data/cyvx-vault.sqlite`. In production, automate encrypted snapshots and test restores.
