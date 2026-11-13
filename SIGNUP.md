# CarePurse sign-up plan

How Mama and her daughter join CarePurse. The goal: **the daughter does the setup, and Mama does one step.**

## Why the daughter starts

Mama is the least comfortable with apps. Asking her to register, then send a link, then wait puts the hardest work on her. The daughter is the one paying and setting the rules, so she does the setup. Mama only taps a link and types a code.

Mama can still start first if she hears about CarePurse before her daughter does (see "Backup path" below). The daughter-first path is the main one, and the one we demo.

## Screen 0: the first screen

Two big buttons, no jargon:

```
            CarePurse

[ I'm setting this up for my mum ]   → daughter's setup (Privy)
[ I'm Mama / I have a link       ]   → phone number + code
```

## Main path: the daughter sets everything up (about 3 minutes)

A step-by-step setup with a progress bar ("Step 2 of 5"). She can leave and come back; her progress is saved.

| Step | Screen | What she does |
|---|---|---|
| 1 | **Sign in** | Privy, with email or Google. Her Stellar wallet is created behind the scenes, with no seed phrase. |
| 2 | **About Mama** | Mama's name, Mama's phone number, Mama's language (English or Pidgin). |
| 3 | **Mama's meter and phone** | She enters the meter number, and we show the owner's name ("NGOZI OKAFOR, IKEDC prepaid") so she can confirm it's Mama's. Airtime and data go to Mama's phone number by default, with an option to add another number. |
| 4 | **Limits** | Picks a ready-made choice (below), or Custom for the full table. |
| 5 | **Fund the purse** | Sees the purse address and a QR code. On testnet: a "Get test USDC" button. |
| Done | **Invite Mama** | Sends Mama her link (see "Invite links"). |

### Limit presets (step 4)

Shown in naira so the daughter doesn't do maths. The app converts to USDC behind the scenes.

| Preset | Electricity | Airtime | Data |
|---|---|---|---|
| **Light** | up to ₦5,000 a week | up to ₦500 a day | up to ₦500 a day |
| **Standard** | up to ₦10,000 a week | up to ₦1,000 a day | up to ₦1,000 a day |
| **Custom** | the full table: per top-up, per day, per week, per month, for each utility, plus a monthly total |

The minimum top-ups still apply: ₦500 for electricity, ₦100 for airtime and data.

## Mama's side: one step

1. **She taps the link.** Her phone number is already filled in, so she just taps **[Send code]**.
2. **She types the 6-digit code.** In the demo, the code shows on screen instead of being sent by SMS.
3. **She's in.** The chat opens with a welcome message in her language:

   > "Welcome Mama Ngozi! Adaeze has set up CarePurse for you. Tell me when your light, airtime or data is low."

She stays logged in on her phone, and the site prompts her to **add it to her home screen**, so next time she just taps the icon. An optional 4-digit PIN protects purchases.

## Invite links

- **How it's sent:** a **[Share on WhatsApp]** button opens WhatsApp with this message ready to send:

  > "Mama, I've set up CarePurse for you. Tap here to start: carepurse.app/i/abc123"

  There's also a **[Copy link]** button for SMS or anything else.
- **Each link works once** and **expires after 7 days**.
- **If Mama didn't use it in time,** the daughter taps **[Send a new invite]** on her dashboard to get a fresh 7-day link. She can do this any time Mama hasn't joined yet.
- **Only the newest link works.** Making a new link cancels the old one, so an old message forwarded to someone else is useless.
- **The code goes only to the number the daughter entered.** Even with the link, someone else can't claim Mama's purse.
- **The dashboard shows the invite status:** "Waiting for Mama to join (link expires in 5 days)", "Link expired: send a new one", or "Mama joined on 14 Nov".

## Backup path: Mama starts first

1. Mama taps **I'm Mama**, enters her phone number and code, and picks her language.
2. She sees: **"Who will look after your CarePurse?"** with a **[Share on WhatsApp]** button that sends the link to her child.
3. Until her child finishes setup, Mama's chat says: **"Waiting for Adaeze to finish setting up."** She can't buy anything yet.
4. Her child opens the link, signs in with Privy, and follows the same 5 steps, with Mama's name and phone already filled in.
5. The same link rules apply: one use, 7 days. Mama can tap **[Send a new link]** if it expired.

## Rules that never change

- **Mama never sees** a wallet, a seed phrase or a USDC amount. She only sees naira.
- **Only the daughter** sets or changes the meter, phone numbers and limits.
- **One guardian per purse** for the MVP. A second guardian (for example, two daughters) comes later.

## Screens to build

| # | Screen | Who |
|---|---|---|
| 0 | Welcome: two buttons | Everyone |
| D1 | Sign in with Privy | Daughter |
| D2 | About Mama | Daughter |
| D3 | Mama's meter and phone (with the owner-name check) | Daughter |
| D4 | Limits: Light / Standard / Custom | Daughter |
| D5 | Fund the purse (address, QR, testnet USDC button) | Daughter |
| D6 | Invite Mama (WhatsApp, copy link) | Daughter |
| D7 | Dashboard: balance, receipts, limits, invite status, **[Send a new invite]**, Pause | Daughter |
| M1 | Phone number + code | Mama |
| M2 | Language choice (backup path only; the daughter already picked it in the main path) | Mama |
| M3 | Waiting for my child (backup path only) | Mama |
| M4 | Chat with Mhasibu | Mama |
