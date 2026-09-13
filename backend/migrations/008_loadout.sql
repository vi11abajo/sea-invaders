BEGIN;
CREATE TABLE IF NOT EXISTS player_loadout (
    wallet_address VARCHAR(64) PRIMARY KEY,
    inventory BIGINT NOT NULL DEFAULT 0,
    tide SMALLINT,
    tide_at BIGINT,
    active_skin SMALLINT DEFAULT 0,
    active_variant SMALLINT DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
