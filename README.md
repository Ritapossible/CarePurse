# CarePurse

Mama in Nigeria asks for electricity, airtime or data in a chat. Our AI agent, **Mhasibu**, pays for it over **x402 on Stellar**, within limits her daughter sets.

Built for **EmpowerHer: Building the Agent Economy**. Stellar **testnet** only.

> Live Stellar Testnet payment · sandbox utility fulfilment

## Start here

Read these in order:

1. **[MEMORY.md](MEMORY.md)**: everything we decided (users, sign-up, limits, wording).
2. **[ARCHITECTURE.md](ARCHITECTURE.md)**: the parts, the flows, the contract and the API.
3. **[PLAN.md](PLAN.md)**: what to build, in what order, and who does it.
4. **[library.md](library.md)**: workshop materials and Stellar x402 docs (temporary).

## How it works

1. **The daughter** signs in with Privy, saves Mama's meter and phone number, sets spending limits per utility, and funds the purse in USDC.
2. **Mama** logs in with her phone number and chats: "Abeg, light don almost finish".
3. **Mhasibu** offers fixed options. Mama replies "1".
4. **The gateway** answers **HTTP 402 Payment Required**. Mhasibu signs a USDC payment, the facilitator settles it on Stellar testnet, and the gateway returns the electricity token.
5. **Mama** sees the token in the chat, and the daughter gets a receipt with the transaction link.

## Repo layout (planned)

```
apps/web/            Next.js: Mama's chat, the daughter's dashboard, Mhasibu (agent)
services/gateway/    Express + @x402/express: the paid top-up API
contracts/purse/     Soroban (Rust): the purse and its spending limits
```

## Getting started (for teammates)

```bash
git clone https://github.com/Ritapossible/CarePurse.git
cd CarePurse
cp .env.example .env     # fill it in; never commit it
```

Before writing code, run Koxy's workshop kit once (see `library.md`, section 5), so we know our wallets and the facilitator work. Then follow `PLAN.md`, Step 0.

## Team

Gloria & Rita
