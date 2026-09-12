use anchor_lang::prelude::*;

#[error_code]
pub enum SeaError {
    #[msg("The program is paused")]
    Paused,
    #[msg("Invalid configuration value")]
    InvalidConfig,
    #[msg("Wrong token mint")]
    WrongMint,
    #[msg("Wrong week pool for this day")]
    WrongWeekPool,
    #[msg("Day is not open for records")]
    DayClosed,
    #[msg("No ticket for that day")]
    NoTicketForDay,
    #[msg("Record belongs to an older week")]
    StaleWeek,
    #[msg("Score does not beat the recorded best")]
    NotAnImprovement,
    #[msg("Week is not finished yet")]
    WeekNotFinished,
    #[msg("Week already settled")]
    AlreadySettled,
    #[msg("Winner accounts do not match the top list")]
    WinnerMismatch,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Only the program's upgrade authority may initialize the config")]
    NotUpgradeAuthority,
}
