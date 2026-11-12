# Notes for AI coding assistants

Before changing anything, read `MEMORY.md` (decisions), `ARCHITECTURE.md` (design) and `PLAN.md` (current step).

- Stellar **testnet** only. Never point anything at mainnet.
- Never commit `.env` or print secret keys.
- x402 is the centre of the product: keep the 402 → sign → retry → settle flow intact.
- Spending limits are enforced in code or on-chain, never in the AI prompt. Don't tell Mhasibu its limits.
- Only the guardian (daughter) can change destinations or limits.
- Use the wording rules in `MEMORY.md` (for example "Live Stellar Testnet payment · sandbox utility fulfilment").
- USDC on Stellar has 7 decimals.
- Follow the workshop kit's patterns (`library.md`, section 5) for the gateway and the paying client.
