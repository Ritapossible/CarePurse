//! CarePurse purse contract (Soroban).
//!
//! Holds Mama's USDC and enforces the guardian's rules on-chain, so the agent cannot spend
//! past them even if its own code is wrong or compromised.
//!
//!   guardian (the daughter)  sets caps and saved destinations, pauses, withdraws
//!   agent (Mhasibu)          calls `buy` before each top-up; the contract checks every rule
//!                            and sends exactly that amount to the agent wallet, which then
//!                            pays the CarePurse gateway with standard x402
//!
//! Amounts are USDC base units (7 decimals). Periods follow Lagos time (UTC+1); weeks start
//! on Monday; months are calendar months.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token, Address,
    BytesN, Env, Symbol,
};

const LAGOS_OFFSET: u64 = 3_600;
const DAY: u64 = 86_400;
const BUMP_LEDGERS: u32 = 535_680; // about 30 days
// extend_ttl only acts when the remaining lifetime is below this threshold. New entries start at
// the network minimum (about 7 days on testnet), so the threshold sits just under 30 days: every
// write or call tops the lifetime back up to about 30 days.
const BUMP_THRESHOLD: u32 = BUMP_LEDGERS - 17_280;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Paused = 1,
    NoCaps = 2,
    OverPerTopup = 3,
    OverDay = 4,
    OverWeek = 5,
    OverMonth = 6,
    OverPurseMonth = 7,
    WrongDestination = 8,
    BadAmount = 9,
    LowBalance = 10,
    OrderUsed = 11,
    NoOrder = 12,
    AlreadyRefunded = 13,
    NotLatestOrder = 14,
}

/// Limits for one utility. 0 means "no limit for this period"; a utility with no caps at all
/// cannot be bought (default deny).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Caps {
    pub per_topup: i128,
    pub per_day: i128,
    pub per_week: i128,
    pub per_month: i128,
}

#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Spent {
    pub day: u64,
    pub day_amount: i128,
    pub week: u64,
    pub week_amount: i128,
    pub month: u64,
    pub month_amount: i128,
}

/// What `buy` released for one order, so a failed payment can be refunded exactly.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OrderRec {
    pub utility: Symbol,
    pub amount: i128,
    pub day: u64,
    pub week: u64,
    pub month: u64,
    pub refunded: bool,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Guardian,
    Agent,
    Usdc,
    Paused,
    PurseCap,
    PurseSpent,
    Caps(Symbol),
    Dest(Symbol),
    Spent(Symbol),
    Order(BytesN<32>),
    LastOrder,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Bought {
    #[topic]
    pub utility: Symbol,
    pub dest_hash: BytesN<32>,
    pub amount: i128,
    pub order_ref: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub utility: Symbol,
    pub amount: i128,
    pub order_ref: BytesN<32>,
}

#[contract]
pub struct Purse;

fn periods(now: u64) -> (u64, u64, u64) {
    let day = (now + LAGOS_OFFSET) / DAY;
    // 1 Jan 1970 was a Thursday, so day + 3 counts from a Monday.
    let week = (day + 3) / 7;
    // Days to (year, month): Howard Hinnant's civil_from_days.
    let z = day as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    (day, week, (year * 12 + month - 1) as u64)
}

fn guardian(env: &Env) -> Address {
    env.storage().instance().get(&Key::Guardian).unwrap()
}

fn bump(env: &Env) {
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_LEDGERS);
}

// Order records live in persistent storage, which has its own lifetime: keep each one alive for
// the same window as the instance, so `refund` and the one-time-order check keep working.
fn save_order(env: &Env, order_ref: &BytesN<32>, rec: &OrderRec) {
    let key = Key::Order(order_ref.clone());
    env.storage().persistent().set(&key, rec);
    env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_LEDGERS);
}

#[contractimpl]
impl Purse {
    pub fn __constructor(env: Env, guardian: Address, agent: Address, usdc: Address) {
        let s = env.storage().instance();
        s.set(&Key::Guardian, &guardian);
        s.set(&Key::Agent, &agent);
        s.set(&Key::Usdc, &usdc);
        s.set(&Key::Paused, &false);
        s.set(&Key::PurseCap, &0i128);
    }

    // ── Guardian only ─────────────────────────────────────────

    pub fn set_caps(env: Env, utility: Symbol, caps: Caps) {
        guardian(&env).require_auth();
        if caps.per_topup <= 0 || caps.per_day < 0 || caps.per_week < 0 || caps.per_month < 0 {
            panic_with_error!(&env, Error::BadAmount);
        }
        env.storage().instance().set(&Key::Caps(utility), &caps);
        bump(&env);
    }

    /// Whole-purse limit per calendar month (0 = none).
    pub fn set_purse_cap(env: Env, per_month: i128) {
        guardian(&env).require_auth();
        if per_month < 0 {
            panic_with_error!(&env, Error::BadAmount);
        }
        env.storage().instance().set(&Key::PurseCap, &per_month);
        bump(&env);
    }

    /// The saved meter or phone for a utility, as sha256 of the number, so the ledger
    /// doesn't show where Mama lives.
    pub fn set_destination(env: Env, utility: Symbol, dest_hash: BytesN<32>) {
        guardian(&env).require_auth();
        env.storage().instance().set(&Key::Dest(utility), &dest_hash);
        bump(&env);
    }

    pub fn set_agent(env: Env, agent: Address) {
        guardian(&env).require_auth();
        env.storage().instance().set(&Key::Agent, &agent);
    }

    pub fn pause(env: Env) {
        guardian(&env).require_auth();
        env.storage().instance().set(&Key::Paused, &true);
    }

    pub fn unpause(env: Env) {
        guardian(&env).require_auth();
        env.storage().instance().set(&Key::Paused, &false);
    }

    pub fn withdraw(env: Env, to: Address, amount: i128) {
        guardian(&env).require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::BadAmount);
        }
        let usdc: Address = env.storage().instance().get(&Key::Usdc).unwrap();
        token::TokenClient::new(&env, &usdc).transfer(&env.current_contract_address(), &to, &amount);
    }

    // ── Agent only ────────────────────────────────────────────

    /// Checks every rule, records the spend and sends exactly `amount` to the agent wallet.
    /// The first "no" wins and the whole call fails, so nothing moves.
    pub fn buy(env: Env, utility: Symbol, dest_hash: BytesN<32>, amount: i128, order_ref: BytesN<32>) -> Result<(), Error> {
        let s = env.storage().instance();
        let agent: Address = s.get(&Key::Agent).unwrap();
        agent.require_auth();

        if s.get(&Key::Paused).unwrap_or(false) {
            return Err(Error::Paused);
        }
        if amount <= 0 {
            return Err(Error::BadAmount);
        }
        let saved: Option<BytesN<32>> = s.get(&Key::Dest(utility.clone()));
        if saved != Some(dest_hash.clone()) {
            return Err(Error::WrongDestination);
        }
        let caps: Caps = s.get(&Key::Caps(utility.clone())).ok_or(Error::NoCaps)?;
        if amount > caps.per_topup {
            return Err(Error::OverPerTopup);
        }
        let order_key = Key::Order(order_ref.clone());
        if env.storage().persistent().has(&order_key) {
            return Err(Error::OrderUsed);
        }

        let (day, week, month) = periods(env.ledger().timestamp());
        let mut spent: Spent = s.get(&Key::Spent(utility.clone())).unwrap_or_default();
        if spent.day != day { spent.day = day; spent.day_amount = 0; }
        if spent.week != week { spent.week = week; spent.week_amount = 0; }
        if spent.month != month { spent.month = month; spent.month_amount = 0; }
        if caps.per_day > 0 && spent.day_amount + amount > caps.per_day {
            return Err(Error::OverDay);
        }
        if caps.per_week > 0 && spent.week_amount + amount > caps.per_week {
            return Err(Error::OverWeek);
        }
        if caps.per_month > 0 && spent.month_amount + amount > caps.per_month {
            return Err(Error::OverMonth);
        }
        let purse_cap: i128 = s.get(&Key::PurseCap).unwrap_or(0);
        let (mut purse_month, mut purse_amount): (u64, i128) = s.get(&Key::PurseSpent).unwrap_or((month, 0));
        if purse_month != month { purse_month = month; purse_amount = 0; }
        if purse_cap > 0 && purse_amount + amount > purse_cap {
            return Err(Error::OverPurseMonth);
        }

        let usdc: Address = s.get(&Key::Usdc).unwrap();
        let token = token::TokenClient::new(&env, &usdc);
        let me = env.current_contract_address();
        if token.balance(&me) < amount {
            return Err(Error::LowBalance);
        }

        spent.day_amount += amount;
        spent.week_amount += amount;
        spent.month_amount += amount;
        s.set(&Key::Spent(utility.clone()), &spent);
        s.set(&Key::PurseSpent, &(purse_month, purse_amount + amount));
        let rec = OrderRec { utility: utility.clone(), amount, day, week, month, refunded: false };
        save_order(&env, &order_ref, &rec);
        s.set(&Key::LastOrder, &order_ref);
        bump(&env);

        token.transfer(&me, &agent, &amount);
        Bought { utility, dest_hash, amount, order_ref }.publish(&env);
        Ok(())
    }

    /// The x402 payment for this order failed after `buy`: the agent returns exactly the released
    /// USDC to the purse, and the order's spend is taken off the caps (for periods still current).
    /// Only the latest order can be refunded: once a new `buy` happens, older orders are final.
    /// Otherwise an agent could pay for one order and refund it with a later order's USDC, moving
    /// spend from one utility's cap to another's. The order stays used; a retry is a new order.
    pub fn refund(env: Env, order_ref: BytesN<32>) -> Result<(), Error> {
        let s = env.storage().instance();
        let agent: Address = s.get(&Key::Agent).unwrap();
        agent.require_auth();
        let order_key = Key::Order(order_ref.clone());
        let mut rec: OrderRec = env.storage().persistent().get(&order_key).ok_or(Error::NoOrder)?;
        let last: Option<BytesN<32>> = s.get(&Key::LastOrder);
        if last != Some(order_ref.clone()) {
            return Err(Error::NotLatestOrder);
        }
        if rec.refunded {
            return Err(Error::AlreadyRefunded);
        }

        let usdc: Address = s.get(&Key::Usdc).unwrap();
        token::TokenClient::new(&env, &usdc).transfer(&agent, &env.current_contract_address(), &rec.amount);

        let mut spent: Spent = s.get(&Key::Spent(rec.utility.clone())).unwrap_or_default();
        if spent.day == rec.day { spent.day_amount -= rec.amount; }
        if spent.week == rec.week { spent.week_amount -= rec.amount; }
        if spent.month == rec.month { spent.month_amount -= rec.amount; }
        s.set(&Key::Spent(rec.utility.clone()), &spent);
        let (purse_month, purse_amount): (u64, i128) = s.get(&Key::PurseSpent).unwrap_or((rec.month, 0));
        if purse_month == rec.month {
            s.set(&Key::PurseSpent, &(purse_month, purse_amount - rec.amount));
        }

        rec.refunded = true;
        save_order(&env, &order_ref, &rec);
        bump(&env);
        Refunded { utility: rec.utility, amount: rec.amount, order_ref }.publish(&env);
        Ok(())
    }

    // ── Anyone can read ───────────────────────────────────────

    /// The whole-purse limit per calendar month (0 = none), in USDC base units.
    pub fn purse_cap(env: Env) -> i128 {
        env.storage().instance().get(&Key::PurseCap).unwrap_or(0)
    }

    pub fn order(env: Env, order_ref: BytesN<32>) -> Option<OrderRec> {
        env.storage().persistent().get(&Key::Order(order_ref))
    }


    pub fn caps(env: Env, utility: Symbol) -> Option<Caps> {
        env.storage().instance().get(&Key::Caps(utility))
    }

    pub fn spent(env: Env, utility: Symbol) -> Spent {
        env.storage().instance().get(&Key::Spent(utility)).unwrap_or_default()
    }

    pub fn paused(env: Env) -> bool {
        env.storage().instance().get(&Key::Paused).unwrap_or(false)
    }

    pub fn guardian(env: Env) -> Address {
        guardian(&env)
    }

    pub fn agent(env: Env) -> Address {
        env.storage().instance().get(&Key::Agent).unwrap()
    }
}

#[cfg(test)]
mod test;
