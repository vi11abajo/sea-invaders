//! Time helpers shared by every instruction that reasons about days and
//! weeks (spec §5.1). A "day" is the number of whole 86 400-second periods
//! since the Unix epoch; a "week" starts on Monday and is numbered so that
//! `weekday_of` returns `0` for Monday (the epoch, 1970-01-01, was a
//! Thursday, i.e. weekday `3`).

use anchor_lang::prelude::*;

use crate::state::Config;

pub const DAY: i64 = 86_400;

/// The current unix time, as every instruction that needs "now" must read
/// it: never call `Clock::get()` directly. Under the `test-clock` feature,
/// a non-zero `config.clock_override` takes precedence (set by the
/// test-only `set_test_clock` instruction); otherwise - and always in a
/// production build, since `test-clock` is never enabled there - this
/// falls back to the real `Clock` sysvar.
pub fn now(config: &Config) -> Result<i64> {
    #[cfg(feature = "test-clock")]
    if config.clock_override != 0 {
        return Ok(config.clock_override);
    }
    #[cfg(not(feature = "test-clock"))]
    let _ = config;
    Ok(Clock::get()?.unix_timestamp)
}

pub fn day_of(ts: i64) -> u32 {
    (ts / DAY) as u32
}

pub fn week_of(day: u32) -> u32 {
    (day + 3) / 7
}

pub fn weekday_of(day: u32) -> u8 {
    ((day + 3) % 7) as u8
}

pub fn day_start(day: u32) -> i64 {
    day as i64 * DAY
}

/// First day of `week` (a Monday).
pub fn week_first_day(week: u32) -> u32 {
    week * 7 - 3
}

pub fn week_end(week: u32) -> i64 {
    day_start(week_first_day(week + 1))
}

/// A record for `day` is accepted until 00:15 UTC of the next day.
pub fn is_day_open(day: u32, now: i64, grace: u32) -> bool {
    now >= day_start(day) && now < day_start(day + 1) + grace as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_is_thursday() {
        assert_eq!(weekday_of(0), 3);
    }

    #[test]
    fn monday_2026_09_07() {
        // 1_788_739_200 = 2026-09-07T00:00:00Z, a Monday (verified with
        // `date -u -d @1788739200` in WSL; the brief's original constant,
        // 1_788_912_000, is 2026-09-09, a Wednesday, so it was replaced
        // here and in tests/fixtures.ts per the brief's own fallback rule).
        let d = day_of(1_788_739_200);
        assert_eq!(weekday_of(d), 0);
        assert_eq!(week_first_day(week_of(d)), d);
    }

    #[test]
    fn grace_window() {
        let d = 20_707;
        assert!(is_day_open(d, day_start(d + 1) + 899, 900));
        assert!(!is_day_open(d, day_start(d + 1) + 900, 900));
        assert!(!is_day_open(d, day_start(d) - 1, 900));
    }

    #[test]
    fn week_end_is_next_monday() {
        let w = week_of(20_707);
        assert_eq!(weekday_of(day_of(week_end(w))), 0);
        assert!(week_end(w) > day_start(20_707));
    }

    #[test]
    fn now_falls_back_to_the_clock_sysvar_when_override_is_zero() {
        // Outside a Solana runtime there is no Clock sysvar, so falling
        // through to `Clock::get()` must surface its error rather than
        // silently returning some default - proving `now()` really defers
        // to the sysvar path when there is no override (or, without the
        // `test-clock` feature, unconditionally).
        let cfg = Config { clock_override: 0, ..Default::default() };
        assert!(now(&cfg).is_err());
    }

    #[cfg(feature = "test-clock")]
    #[test]
    fn now_returns_the_override_when_set() {
        let cfg = Config { clock_override: 1_788_739_200, ..Default::default() };
        assert_eq!(now(&cfg).unwrap(), 1_788_739_200);
    }
}
