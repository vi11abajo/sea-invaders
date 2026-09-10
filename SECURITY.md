# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report privately through GitHub's [private vulnerability reporting](https://github.com/vi11abajo/sea-invaders/security/advisories/new) — the **Security** tab of this repository, then **Report a vulnerability**.

Include what you need to make the issue reproducible:

- What the problem is and what an attacker could achieve
- Steps to reproduce, or a proof of concept
- Affected version, commit, or URL

You can expect an initial response within a few days. Please give us a reasonable window to ship a fix before disclosing publicly.

## Scope

In scope:

- The game client and its anti-cheat logic (`game/`, `boosts/`, `boss-system/`)
- The Next.js application and its API routes (`app/`, `lib/`)
- The Express backend: authentication, score submission, leaderboard (`backend/`)

Out of scope:

- Findings that require a compromised player device or browser extension
- Volumetric denial of service
- Reports produced solely by automated scanners, without a demonstrated impact
- Vulnerabilities in third-party dependencies that are already public and have no exploitable path in this project

## Handling secrets

This repository contains no credentials. Every secret used by the deployment pipeline is stored in GitHub Actions secrets and injected at deploy time — see [VPS-DEPLOYMENT.md](./VPS-DEPLOYMENT.md).

If you believe a credential has been committed, report it privately rather than opening an issue, so it can be rotated first.
