# Security Policy

## Never commit

- `.env`
- private keys
- mnemonic or seed phrases
- signer passphrases
- raw signed production transactions
- authenticated provider credentials

## Runtime gates

- `ENABLE_LIVE` must equal `false`.
- `MAINNET_RPC_URL` must point to the loopback read-only gateway.
- The upstream must be HTTPS Ethereum mainnet and must contain Aave Pool bytecode.
- Bundle, transaction, signing, wallet, node-administration, debug, trace, and MEV send methods are rejected by the gateway.
- Fork execution uses only Anvil's disposable account and local port.

## Required before any live milestone

- independent Solidity review;
- real-router mainnet-fork integration coverage;
- non-standard-token and approval testing;
- nonce, gas, daily-loss, and rate limits;
- EIP-1559 policy signer with destination and selector restrictions;
- Flashbots simulation evidence;
- small-value canary deployment and incident rollback.
