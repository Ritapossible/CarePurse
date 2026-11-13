# CarePurse sign-up plan

**One path for the hackathon: the daughter sets it up, and Mama only opens a link.**

The person who pays has to be the one who starts, because a purse with no guardian, no meter and no limits can't be used. If Mama hears about CarePurse first, she tells her daughter, and the daughter signs up and sends her the link. Mama can't create a purse herself. For the demo, Adaeze always starts.

## The first screen

```
                 CarePurse

 [ Set up CarePurse for your mum ]   → daughter's sign-up

   I'm Mama  →  "Ask your child to set up CarePurse
                 and send you the link."
```

The "I'm Mama" option is only a message. There's no account and no waiting screen for Mama without a link.

## Daughter: four screens

### 1. Sign in
One button: **Continue with email or Google** (Privy). Her Stellar wallet is created behind that, with no seed phrase.

### 2. Mama
Mama's **name**, **phone number**, and **language** (English or Pidgin).

### 3. Where the money goes
- She enters Mama's **meter number**.
- We show the **owner's name** so she can confirm it's Mama's: "NGOZI OKAFOR, IKEDC prepaid".
- Airtime and data go to **Mama's phone number from screen 2**. There's no second number in the MVP.

### 4. Limits, then fund
Two presets, no table:

| Preset | Electricity | Airtime | Data |
|---|---|---|---|
| **Light** | ₦2,000 a time, ₦5,000 a week | ₦200 a time, ₦500 a day | ₦200 a time, ₦500 a day |
| **Standard** | ₦5,000 a time, ₦15,000 a week | ₦500 a time, ₦1,000 a day | ₦500 a time, ₦1,000 a day |

- **We demo Standard.**
- **Monthly cap:** the whole-purse monthly cap is **calculated for her**, and she never fills it in. It's the electricity weekly limit × 4, plus the airtime and data daily limits × 30. That gives ₦50,000 for Light and ₦120,000 for Standard.
- **Custom limits** are a later edit on the dashboard, not part of sign-up.
- **Minimums still apply:** ₦500 for electricity, ₦100 for airtime and data.

Then, on the same screen:
- the **purse address**
- a **QR code**
- a **Get test USDC** button (testnet)

### Last action: invite Mama
Two buttons:
- **Copy link**
- **Share on WhatsApp.** This is just a `wa.me` link with the message filled in, not a WhatsApp integration:

> Mama, I've set up CarePurse for you. Tap here to start: carepurse.app/i/abc123

## Mama: one screen

1. **The link opens** with her phone number already filled in.
2. **She taps Send code** and types the 6 digits. In the demo, the code is shown on screen.
3. **The chat opens:**

> Welcome Mama Ngozi. Adaeze has set up CarePurse for you. Tell me when your light, airtime or data is low.

- **She stays logged in.**
- **Home screen:** we prompt her **once** to add the site to her home screen.
- **What she sees:** never a wallet, a seed phrase or USDC. Only naira.

## Rules

- **The code is for the number the daughter entered.** A forwarded link isn't enough to get in.
- **The invite works once and expires after 7 days.**
- **If Mama didn't use it in time,** the daughter taps **Send a new invite** on her dashboard. The new link cancels the old one.
- **One guardian per purse.**
- **One purse per Mama** for the MVP.

## Not in the MVP

- Mama starting first, and any "waiting for your child" state
- A step-by-step wizard with more than four screens
- A custom limit table during sign-up (it's a dashboard edit later)
- A second phone number for airtime or data
- Real WhatsApp messaging (we only use a `wa.me` share link)
- Several guardians, or several purses for one Mama

## Screens to build

| # | Screen | Who |
|---|---|---|
| 0 | First screen: set-up button, plus the "I'm Mama" message | Everyone |
| D1 | Sign in (Privy) | Daughter |
| D2 | Mama: name, phone, language | Daughter |
| D3 | Where the money goes: meter + owner-name check | Daughter |
| D4 | Limits (Light / Standard), then fund: address, QR, Get test USDC | Daughter |
| D5 | Invite Mama: Copy link, Share on WhatsApp | Daughter |
| D6 | Dashboard: balance, receipts, invite status, Send a new invite, Pause (custom limits later) | Daughter |
| M1 | Invite link: phone filled in, Send code, enter code | Mama |
| M2 | Chat with Mhasibu | Mama |
