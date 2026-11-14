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
const BUMP_THRESHOLD: u32 = 17_280; // about 1 day

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
        env.storage().persistent().set(&order_key, &true);
        bump(&env);

        token.transfer(&me, &agent, &amount);
        Bought { utility, dest_hash, amount, order_ref }.publish(&env);
        Ok(())
    }

    // ── Anyone can read ───────────────────────────────────────

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
