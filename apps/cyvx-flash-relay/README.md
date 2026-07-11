# CYVX Flash Relay

Fork-first Ethereum Aave V3 flash-loan arbitrage executor with a fail-closed read-only data plane.

## Capability

- Aave V3 `flashLoanSimple` executor.
- Owner/operator separation and two-step ownership transfer.
- Token and router allowlists.
- Uniswap V3 and SushiSwap V2 direct-pair routes.
- Treasury-isolated minimum-profit enforcement.
- Runtime Aave premium lookup.
- Pinned-block exact quotes in both route directions.
- Gas cost valuation in USDC.
- Loopback JSON-RPC gateway that rejects writes, signing, wallet, node-admin, MEV, and Flashbots send methods.
- Local Anvil mainnet-fork execution only when a route clears the configured threshold.
- Durable JSON/JSONL evidence and a mobile dashboard.
- Solidity and Python policy tests.

## Run

```bash
cd ~/CYVXAI-OS/apps/cyvx-flash-relay && \
chmod +x scripts/cyvx.sh && \
./scripts/cyvx.sh run
```

The command installs Foundry when needed, validates a working Ethereum mainnet endpoint, starts the read-only gateway, compiles and tests the executor, runs the quote scan, and starts the dashboard at `http://127.0.0.1:8789`.

## Exact quote scan

```bash
./scripts/cyvx.sh quote
```

Results are written to `data/latest-quotes.json` at one pinned Ethereum block.

## Local fork execution

```bash
./scripts/cyvx.sh fork
```

A local transaction runs only when the best route clears `FORK_REQUIRED_NET_USDC`. Otherwise the process records a safe no-op. Anvil uses a disposable test key and no transaction is submitted to Ethereum or Flashbots.

## Verify

```bash
./scripts/cyvx.sh verify
./scripts/cyvx.sh status
```

## Safety boundary

`ENABLE_LIVE=false` is mandatory. No funded private key, seed phrase, signer passphrase, bundle sender, or relay submission implementation is accepted by this milestone.

The external `AryaSingh22/The-Flash-Loan` repository was reviewed as a Polygon/Uniswap-V2 reference. Its hardcoded BUSD/WBNB/CROX/CAKE flow is not imported into this Ethereum Aave V3 runtime.
