-- PostgreSQL database setup script
-- Run: sudo -u postgres psql -f setup-database.sql

-- IMPORTANT: replace YOUR_STRONG_PASSWORD with a real password!

CREATE USER sea_invaders_user WITH PASSWORD 'YOUR_STRONG_PASSWORD';
CREATE DATABASE sea_invaders OWNER sea_invaders_user;
GRANT ALL PRIVILEGES ON DATABASE sea_invaders TO sea_invaders_user;

-- Connect to the database to set up schema privileges
\c sea_invaders

GRANT ALL ON SCHEMA public TO sea_invaders_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO sea_invaders_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO sea_invaders_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO sea_invaders_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO sea_invaders_user;

\echo 'Database sea_invaders created successfully!'
\echo 'User: sea_invaders_user'
\echo 'IMPORTANT: store the password somewhere safe!'
