#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{token::StellarAssetClient, Bytes, IntoVal};

const USDC: i128 = 10_000_000; // 7 decimals
// 14 Nov 2026 12:00 UTC (a Saturday)
const SAT: u64 = 1_794_657_600;

struct Setup {
    env: Env,
    purse: PurseClient<'static>,
    token: token::TokenClient<'static>,
    guardian: Address,
    agent: Address,
    meter: BytesN<32>,
}

fn sha(env: &Env, s: &str) -> BytesN<32> {
    env.crypto().sha256(&Bytes::from_slice(env, s.as_bytes())).into()
}

fn order(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(SAT);
    let guardian = Address::generate(&env);
    let agent = Address::generate(&env);
    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let id = env.register(Purse, (guardian.clone(), agent.clone(), sac.address()));
    let purse = PurseClient::new(&env, &id);
    StellarAssetClient::new(&env, &sac.address()).mint(&id, &(50 * USDC));
    let meter = sha(&env, "45012345678");
    let electricity = Symbol::new(&env, "electricity");
    // Standard preset at ₦1,470 per USDC: ₦5,000 per top-up ≈ 3.4014 USDC, ₦15,000 per week.
    purse.set_caps(&electricity, &Caps { per_topup: 34_013_606, per_day: 0, per_week: 102_040_818, per_month: 0 });
    purse.set_destination(&electricity, &meter);
    let token = token::TokenClient::new(&env, &sac.address());
    Setup { env, purse, token, guardian, agent, meter }
}

#[test]
fn buy_sends_exactly_the_amount_to_the_agent() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    t.purse.buy(&e, &t.meter, &3_401_361, &order(&t.env, 1));
    assert_eq!(t.token.balance(&t.agent), 3_401_361);
    assert_eq!(t.purse.spent(&e).week_amount, 3_401_361);
}

#[test]
fn over_the_per_topup_cap_is_refused_on_chain() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    let r = t.purse.try_buy(&e, &t.meter, &(7 * USDC), &order(&t.env, 1));
    assert_eq!(r, Err(Ok(Error::OverPerTopup)));
    assert_eq!(t.token.balance(&t.agent), 0);
}

#[test]
fn a_meter_the_guardian_did_not_save_is_refused() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    let other = sha(&t.env, "45099999999");
    assert_eq!(t.purse.try_buy(&e, &other, &USDC, &order(&t.env, 1)), Err(Ok(Error::WrongDestination)));
}

#[test]
fn a_utility_with_no_caps_cannot_be_bought() {
    let t = setup();
    let airtime = Symbol::new(&t.env, "airtime");
    let phone = sha(&t.env, "08031234567");
    t.purse.set_destination(&airtime, &phone);
    assert_eq!(t.purse.try_buy(&airtime, &phone, &USDC, &order(&t.env, 1)), Err(Ok(Error::NoCaps)));
}

#[test]
fn weekly_cap_holds_and_resets_on_monday() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    for n in 1..=3 {
        t.purse.buy(&e, &t.meter, &34_013_606, &order(&t.env, n));
        t.purse.commit(&order(&t.env, n));
    }
    assert_eq!(t.purse.try_buy(&e, &t.meter, &USDC, &order(&t.env, 4)), Err(Ok(Error::OverWeek)));
    // Sunday 23:30 Lagos is still the same week.
    t.env.ledger().set_timestamp(SAT + DAY + 10 * 3_600 + 1_800);
    assert_eq!(t.purse.try_buy(&e, &t.meter, &USDC, &order(&t.env, 5)), Err(Ok(Error::OverWeek)));
    // Monday 00:30 Lagos: a new week.
    t.env.ledger().set_timestamp(SAT + DAY + 11 * 3_600 + 1_800);
    t.purse.buy(&e, &t.meter, &USDC, &order(&t.env, 6));
}

#[test]
fn purse_monthly_cap_and_daily_cap() {
    let t = setup();
    let data = Symbol::new(&t.env, "data");
    let phone = sha(&t.env, "08031234567");
    t.purse.set_destination(&data, &phone);
    t.purse.set_caps(&data, &Caps { per_topup: 5 * USDC, per_day: 6 * USDC, per_week: 0, per_month: 0 });
    t.purse.buy(&data, &phone, &(5 * USDC), &order(&t.env, 1));
    t.purse.commit(&order(&t.env, 1));
    assert_eq!(t.purse.try_buy(&data, &phone, &(2 * USDC), &order(&t.env, 2)), Err(Ok(Error::OverDay)));
    t.purse.set_purse_cap(&(6 * USDC));
    t.env.ledger().set_timestamp(SAT + DAY);
    assert_eq!(t.purse.try_buy(&data, &phone, &(2 * USDC), &order(&t.env, 3)), Err(Ok(Error::OverPurseMonth)));
}

#[test]
fn paused_purse_and_reused_order_are_refused() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    t.purse.buy(&e, &t.meter, &USDC, &order(&t.env, 1));
    t.purse.commit(&order(&t.env, 1));
    assert_eq!(t.purse.try_buy(&e, &t.meter, &USDC, &order(&t.env, 1)), Err(Ok(Error::OrderUsed)));
    t.purse.pause();
    assert_eq!(t.purse.try_buy(&e, &t.meter, &USDC, &order(&t.env, 2)), Err(Ok(Error::Paused)));
    t.purse.unpause();
    t.purse.buy(&e, &t.meter, &USDC, &order(&t.env, 2));
}

#[test]
fn low_balance_is_refused() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    t.purse.withdraw(&t.guardian, &(49 * USDC));
    assert_eq!(t.purse.try_buy(&e, &t.meter, &(2 * USDC), &order(&t.env, 1)), Err(Ok(Error::LowBalance)));
}

#[test]
fn only_the_agent_can_buy_and_only_the_guardian_can_set_caps() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    let stranger = Address::generate(&t.env);
    t.env.set_auths(&[]);
    let r = t
        .purse
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &t.purse.address,
                fn_name: "buy",
                args: (e.clone(), t.meter.clone(), USDC, order(&t.env, 1)).into_val(&t.env),
                sub_invokes: &[],
            },
        }])
        .try_buy(&e, &t.meter, &USDC, &order(&t.env, 1));
    assert!(r.is_err());
    let caps = Caps { per_topup: 100 * USDC, per_day: 0, per_week: 0, per_month: 0 };
    let r = t
        .purse
        .mock_auths(&[MockAuth {
            address: &t.agent,
            invoke: &MockAuthInvoke {
                contract: &t.purse.address,
                fn_name: "set_caps",
                args: (e.clone(), caps.clone()).into_val(&t.env),
                sub_invokes: &[],
            },
        }])
        .try_set_caps(&e, &caps);
    assert!(r.is_err());
}

#[test]
fn lagos_periods() {
    // 2026-11-14 12:00 UTC: Lagos day, a Monday-based week, November 2026.
    let (_, _, month) = periods(SAT);
    assert_eq!(month, 2026 * 12 + 10);
    // 31 Dec 2026 23:30 UTC is already 1 Jan 2027 in Lagos.
    let (_, _, m) = periods(1_798_759_800);
    assert_eq!(m, 2027 * 12);
}

#[test]
fn refund_returns_the_usdc_and_gives_back_the_cap() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    // Use the whole week: three ₦5,000 top-ups.
    for n in 1..=3 {
        t.purse.buy(&e, &t.meter, &34_013_606, &order(&t.env, n));
        if n < 3 { t.purse.commit(&order(&t.env, n)); } // 1 and 2 paid; 3 is still open
    }
    // While 3 is open, nothing else can be released.
    assert_eq!(t.purse.try_buy(&e, &t.meter, &USDC, &order(&t.env, 4)), Err(Ok(Error::OrderOpen)));
    // The third payment failed: the agent refunds it.
    t.purse.refund(&order(&t.env, 3));
    assert_eq!(t.token.balance(&t.agent), 2 * 34_013_606);
    assert_eq!(t.purse.spent(&e).week_amount, 2 * 34_013_606);
    assert!(t.purse.order(&order(&t.env, 3)).unwrap().refunded);
    assert_eq!(t.purse.try_refund(&order(&t.env, 3)), Err(Ok(Error::AlreadyRefunded)));
    // Cap room is back, so a new order goes through; the refunded order can't be reused, and after a
    // newer order it can't be refunded either.
    t.purse.buy(&e, &t.meter, &USDC, &order(&t.env, 5));
    t.purse.commit(&order(&t.env, 5));
    assert_eq!(t.purse.try_buy(&e, &t.meter, &USDC, &order(&t.env, 3)), Err(Ok(Error::OrderUsed)));
    assert_eq!(t.purse.try_refund(&order(&t.env, 3)), Err(Ok(Error::NotLatestOrder)));
    assert_eq!(t.purse.try_refund(&order(&t.env, 9)), Err(Ok(Error::NoOrder)));
}

#[test]
fn purse_cap_is_readable() {
    let t = setup();
    assert_eq!(t.purse.purse_cap(), 0);
    t.purse.set_purse_cap(&(80 * USDC));
    assert_eq!(t.purse.purse_cap(), 80 * USDC);
}

#[test]
fn one_open_order_at_a_time_and_a_paid_order_cannot_be_refunded() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    let airtime = Symbol::new(&t.env, "airtime");
    let phone = sha(&t.env, "08011111111");
    t.purse.set_destination(&airtime, &phone);
    t.purse.set_caps(&airtime, &Caps { per_topup: 5 * USDC, per_day: 0, per_week: 0, per_month: 0 });
    t.purse.buy(&e, &t.meter, &USDC, &order(&t.env, 1)); // A released
    assert_eq!(t.purse.open_order(), Some(order(&t.env, 1)));
    // A second tap (or a restarted process) can't release B while A is open.
    assert_eq!(t.purse.try_buy(&airtime, &phone, &USDC, &order(&t.env, 2)), Err(Ok(Error::OrderOpen)));
    t.purse.commit(&order(&t.env, 1)); // A paid
    assert_eq!(t.purse.open_order(), None);
    // A paid order can't be refunded (no moving spend between utilities with someone else's USDC).
    assert_eq!(t.purse.try_refund(&order(&t.env, 1)), Err(Ok(Error::AlreadyCommitted)));
    assert_eq!(t.purse.try_commit(&order(&t.env, 1)), Err(Ok(Error::AlreadyCommitted)));
    t.purse.buy(&airtime, &phone, &USDC, &order(&t.env, 2)); // B
    assert_eq!(t.purse.try_refund(&order(&t.env, 1)), Err(Ok(Error::NotLatestOrder)));
    t.purse.refund(&order(&t.env, 2)); // B failed: back to the purse
    assert_eq!(t.purse.spent(&airtime).day_amount, 0);
    assert_eq!(t.purse.try_commit(&order(&t.env, 2)), Err(Ok(Error::AlreadyRefunded)));
}

#[test]
fn a_crash_after_buy_leaves_the_order_open_and_refundable() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    t.purse.buy(&e, &t.meter, &USDC, &order(&t.env, 1)); // released, then the process dies
    // On restart, the next purchase is refused until the open order is settled...
    assert_eq!(t.purse.try_buy(&e, &t.meter, &USDC, &order(&t.env, 2)), Err(Ok(Error::OrderOpen)));
    // ...and it can still be refunded, because nothing newer exists.
    t.purse.refund(&order(&t.env, 1));
    assert_eq!(t.token.balance(&t.agent), 0);
    t.purse.buy(&e, &t.meter, &USDC, &order(&t.env, 2));
}

#[test]
fn the_guardian_can_close_an_open_order_and_strangers_cannot_commit() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    t.purse.buy(&e, &t.meter, &USDC, &order(&t.env, 1));
    t.env.set_auths(&[]);
    let stranger = Address::generate(&t.env);
    let r = t.purse.mock_auths(&[MockAuth { address: &stranger, invoke: &MockAuthInvoke {
        contract: &t.purse.address, fn_name: "commit", args: (order(&t.env, 1),).into_val(&t.env), sub_invokes: &[] } }])
        .try_commit(&order(&t.env, 1));
    assert!(r.is_err());
    t.env.mock_all_auths();
    t.purse.guardian_close(&order(&t.env, 1)); // e.g. the agent's key was lost
    assert_eq!(t.purse.open_order(), None);
    t.purse.buy(&e, &t.meter, &USDC, &order(&t.env, 2));
}

#[test]
fn order_records_are_kept_alive() {
    use soroban_sdk::testutils::storage::Persistent as _;
    let t = setup();
    // Testnet's real minimum lifetime for new persistent entries (about 7 days).
    t.env.ledger().with_mut(|l| { l.min_persistent_entry_ttl = 120_960; });
    let e = Symbol::new(&t.env, "electricity");
    t.purse.buy(&e, &t.meter, &USDC, &order(&t.env, 1));
    let ttl = t.env.as_contract(&t.purse.address, || t.env.storage().persistent().get_ttl(&Key::Order(order(&t.env, 1))));
    assert!(ttl >= BUMP_LEDGERS - 1, "order TTL {ttl}");
}

#[test]
fn only_the_guardian_can_upgrade() {
    let t = setup();
    let hash = BytesN::from_array(&t.env, &[7; 32]);
    t.env.set_auths(&[]);
    let r = t.purse.mock_auths(&[MockAuth { address: &t.agent, invoke: &MockAuthInvoke {
        contract: &t.purse.address, fn_name: "upgrade", args: (hash.clone(),).into_val(&t.env), sub_invokes: &[] } }])
        .try_upgrade(&hash);
    assert!(r.is_err());
}

#[test]
fn configure_sets_everything_with_one_guardian_signature() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(SAT);
    let guardian = Address::generate(&env);
    let agent = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let id = env.register(Purse, (guardian.clone(), agent.clone(), sac.address()));
    let purse = PurseClient::new(&env, &id);
    StellarAssetClient::new(&env, &sac.address()).mint(&id, &(50 * USDC));
    let (e, a) = (Symbol::new(&env, "electricity"), Symbol::new(&env, "airtime"));
    let (meter, phone) = (sha(&env, "45012345678"), sha(&env, "08031234567"));
    let mut caps = Map::new(&env);
    caps.set(e.clone(), Caps { per_topup: 34_013_606, per_day: 0, per_week: 102_040_818, per_month: 0 });
    caps.set(a.clone(), Caps { per_topup: 3_401_361, per_day: 6_802_722, per_week: 0, per_month: 0 });
    let mut dests = Map::new(&env);
    dests.set(e.clone(), meter.clone());
    dests.set(a.clone(), phone.clone());
    purse.configure(&caps, &dests, &(816 * USDC));
    // Only the guardian signed, and only once.
    assert_eq!(env.auths().len(), 1);
    assert_eq!(env.auths()[0].0, guardian);
    assert_eq!(purse.caps(&e).unwrap().per_week, 102_040_818);
    assert_eq!(purse.purse_cap(), 816 * USDC);
    purse.buy(&a, &phone, &3_401_361, &order(&env, 1));
    purse.commit(&order(&env, 1));
    // Airtime only goes to the saved phone, never to the meter.
    assert_eq!(purse.try_buy(&a, &meter, &1_000_000, &order(&env, 2)), Err(Ok(Error::WrongDestination)));
}

#[test]
fn configure_refuses_bad_caps_and_anyone_but_the_guardian() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    let mut bad = Map::new(&t.env);
    bad.set(e.clone(), Caps { per_topup: 0, per_day: 0, per_week: 0, per_month: 0 });
    assert!(t.purse.try_configure(&bad, &Map::new(&t.env), &0).is_err());
    assert!(t.purse.try_configure(&Map::new(&t.env), &Map::new(&t.env), &-1).is_err());
    let mut caps = Map::new(&t.env);
    caps.set(e.clone(), Caps { per_topup: 100 * USDC, per_day: 0, per_week: 0, per_month: 0 });
    let dests: Map<Symbol, BytesN<32>> = Map::new(&t.env);
    t.env.set_auths(&[]);
    let r = t
        .purse
        .mock_auths(&[MockAuth {
            address: &t.agent,
            invoke: &MockAuthInvoke {
                contract: &t.purse.address,
                fn_name: "configure",
                args: (caps.clone(), dests.clone(), 0i128).into_val(&t.env),
                sub_invokes: &[],
            },
        }])
        .try_configure(&caps, &dests, &0);
    assert!(r.is_err());
}

#[test]
fn set_agent_waits_for_the_open_order() {
    let t = setup();
    let e = Symbol::new(&t.env, "electricity");
    let new_agent = Address::generate(&t.env);
    t.purse.buy(&e, &t.meter, &3_401_361, &order(&t.env, 1));
    // The released USDC is on the old agent wallet: only it can refund or commit, so no switch yet.
    assert_eq!(t.purse.try_set_agent(&new_agent), Err(Ok(Error::OrderOpen)));
    assert_eq!(t.purse.agent(), t.agent);
    t.purse.refund(&order(&t.env, 1));
    t.purse.set_agent(&new_agent);
    assert_eq!(t.purse.agent(), new_agent);
    // The new agent's orders work as before, and a committed order doesn't block a later switch.
    t.purse.buy(&e, &t.meter, &3_401_361, &order(&t.env, 2));
    assert_eq!(t.token.balance(&new_agent), 3_401_361);
    t.purse.commit(&order(&t.env, 2));
    t.purse.set_agent(&t.agent);
    assert_eq!(t.purse.agent(), t.agent);
}
