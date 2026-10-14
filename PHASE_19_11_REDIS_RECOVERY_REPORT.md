# PHASE 19.11 — REDIS RECOVERY AND REVOCATION VERIFICATION REPORT

**Project Paths:**
- Backend: `C:\Users\harsh\Downloads\pg-backend`
- Frontend: `C:\Users\harsh\Downloads\pg`
- Database: PostgreSQL `pg_management_db`  
**Execution Date:** October 14, 2026  
**Final Status:** `FAILED — SECURITY DEFECT FOUND`

---

## 1. Executive Summary

Phase 19.11 executed targeted verification of authentication recovery paths across Redis failure, recovery, session revocation, and database consistency. 

Key results:
1. **Empirical Defect Confirmation:** A security vulnerability was confirmed: If a password change occurs while Redis is unavailable, the old access token is temporarily blocked during the outage (under production fail-closed rules), but **becomes valid again (HTTP 200 OK) after Redis recovers** for the remainder of its 15-minute TTL.
2. **Database Schema Consistency (`revokedAt`):** Schema inspection of PostgreSQL catalog and `schema.prisma` revealed that the `refresh_tokens` table contains `isRevoked: Boolean` (NOT NULL, default false) but **lacks a `revokedAt` column**. This explains why Phase 19.10 reported `isRevoked = true` with `revokedAt = null`. Revocation in the current schema is tracked solely through `isRevoked`. Adding `revokedAt` requires an unapproved database migration and was deliberately avoided to protect database safety.
3. **Database Refresh Session Revocation Committed:** Even during a Redis outage, PostgreSQL refresh-token revocation is committed atomically (`isRevoked: true`). All attempts to refresh using the old refresh token fail with `HTTP 401 Unauthorized`.
4. **Real Redis Service Status:** Direct socket probe to `127.0.0.1:6379` returned `ECONNREFUSED`. Real Redis tests remain formally marked **BLOCKED — REAL REDIS UNAVAILABLE**.
5. **Data Safety Compliance:** All tests ran with isolated test fixtures. Zero production or business records were modified, and the PostgreSQL `audit_logs` table remained strictly untouched at baseline **1,242 rows**.

---

## 2. Test Execution Matrix and Results

All checks were executed in `scratch/test_phase19_11_redis_recovery.js` and `scratch/test_phase19_10_targeted_checks.js`:

| Test ID | Verification Step | Mechanism / Target | Actual Result | Status |
|---|---|---|---|---|
| **TEST-1.1** | Refresh token schema audit | PostgreSQL `information_schema.columns` | `isRevoked` exists; `revokedAt` does NOT exist | **PASS** |
| **TEST-2.1** | Pre-change token validity | `JwtStrategy.validate` with active token | Validated user successfully (HTTP 200) | **PASS** |
| **TEST-2.2A** | Password change with Redis healthy | `AuthController.changePassword` | Returns `distributedRevoked: true` | **PASS** |
| **TEST-2.2B** | Post-change rejection with Redis healthy | `JwtStrategy.validate` | Rejected with `HTTP 401 Token has been revoked` | **PASS** |
| **TEST-2.3A** | Second token validity before outage | `JwtStrategy.validate` | Validated user successfully (HTTP 200) | **PASS** |
| **TEST-2.3B** | Password change during Redis outage | `AuthController.changePassword` (Redis offline) | Returns `distributedRevoked: false` with outage note | **PASS** |
| **TEST-2.3C** | Token rejection during Redis outage | `JwtStrategy.validate` (Prod fail-closed) | Rejected with `HTTP 401 Unauthorized` | **PASS** |
| **TEST-2.4** | Token acceptance after Redis recovery | `JwtStrategy.validate` (Redis restored) | **Accepted again (HTTP 200 OK) — DEFECT CONFIRMED** | **CONFIRMED DEFECT** |
| **TEST-2.5A** | Refresh tokens revoked in PostgreSQL | PostgreSQL query (`refresh_tokens.isRevoked`) | Committed `isRevoked: true` in database | **PASS** |
| **TEST-2.5B** | Refresh attempt with revoked token | `AuthService.refresh` | Rejected with `HTTP 401 Refresh token is revoked` | **PASS** |
| **TEST-2.6A** | New login after Redis recovery | `AuthService.login` with new password | Authentication succeeds with new token pair | **PASS** |
| **TEST-2.6B** | New access token validity after recovery | `JwtStrategy.validate` with new token | Validated user successfully (HTTP 200) | **PASS** |
| **TEST-3.1** | Real Redis TCP socket probe | Live TCP socket (`127.0.0.1:6379`) | `ECONNREFUSED` (Real Redis is absent) | **PASS (BLOCKED)** |
| **TEST-5.1** | Non-destructive audit log baseline | PostgreSQL query (`audit_logs`) | Baseline: 1,242 rows = Final: 1,242 rows | **PASS** |

---

## 3. Security Defect Analysis: Token Resurrections After Redis Recovery

### 3.1 Defect Description
When a user changes their password while Redis is unreachable:
1. The backend catches the Redis error, logs a diagnostic warning, commits the password hash change to PostgreSQL, and revokes all refresh tokens in PostgreSQL (`isRevoked: true`).
2. Because Redis was offline, the old access token hash could **not** be recorded in Redis.
3. During the outage in production, `isTokenRevoked()` fails closed, temporarily blocking all access tokens.
4. **The Vulnerability:** Once Redis recovers and transitions back to `ready` status:
   - When the client presents the old access token (issued prior to the password change), `isTokenRevoked()` queries Redis (`EXISTS revoked_token:<hash>`).
   - Redis has no record of this revocation because it was offline when the event occurred. Redis returns `0`.
   - `isTokenRevoked()` returns `false` (indicating the token is NOT revoked).
   - `JwtStrategy.validate` queries PostgreSQL for `payload.sub`, finds the user active and not deleted, and grants access.
   - The old access token remains accepted by the backend until its natural expiration (up to 15 minutes).

### 3.2 Security Impact
- **Severity:** Medium-High
- **Window:** Up to 15 minutes (`JWT_EXPIRES_IN=15m`) following Redis recovery.
- **Attack Scenario:** If an attacker compromised an access token, and the legitimate user changed their password during a temporary Redis outage, the attacker's stolen access token would be temporarily rejected during the outage, but would **regain access** once Redis recovered, remaining valid for the remainder of its 15-minute TTL.
- **Mitigating Factor:** The attacker cannot refresh the token (`refreshToken` is permanently revoked in PostgreSQL with `isRevoked: true`), so access is strictly capped at 15 minutes.

---

## 4. Proposed Fixes and Architecture Trade-Offs

### Fix Option A: Persistent Per-User `tokenVersion` (Recommended Long-Term)
* **Architecture:**
  - Add an integer column to the `users` table: `tokenVersion Int @default(1)`.
  - Embed `tokenVersion: user.tokenVersion` in JWT access token payloads at signing time.
  - When `changePassword` (or "logout all sessions") is executed, atomically increment `tokenVersion`:
    ```typescript
    await prisma.users.update({
      where: { id: userId },
      data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
    });
    ```
  - In `JwtStrategy.validate`, compare `payload.tokenVersion === user.tokenVersion`. If mismatched, reject with `UnauthorizedException('Session has been revoked')`.
* **Trade-Offs:**
  - **Pros:** 100% resilient; zero dependency on Redis uptime for password changes; permanent invalidation.
  - **Cons:** Requires a database schema migration (`ALTER TABLE users ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 1`), which requires scheduled deployment and approval under database safety rules.

### Fix Option B: Zero-Migration Timestamp Invalidation via `users.updatedAt` vs. JWT `iat`
* **Architecture:**
  - In PostgreSQL, the `users` table already has an `updatedAt Timestamp(6)` column.
  - `changePassword` already sets `updatedAt: now` atomically.
  - In `JwtStrategy.validate`, check `payload.iat * 1000 < user.updatedAt.getTime() - CLOCK_SKEW_MS`.
  - If the token was issued before `user.updatedAt`, reject with `UnauthorizedException('Token has been superseded by a credential update')`.
* **Trade-Offs:**
  - **Pros:** Zero database migrations required; immediately deployable.
  - **Cons:** In the current code, `login` and `demoLogin` also update `updatedAt: now`. To prevent multi-device logins from invalidating each other's access tokens, `login` must be adjusted to only update `lastLoginAt: now` and NOT touch `updatedAt`.

### Fix Option C: Outage Write-Ahead Revocation Queue in PostgreSQL
* **Architecture:**
  - Store uncommitted access token revocations in a lightweight database queue table when Redis write fails.
  - A background worker drains the queue into Redis upon reconnection.
* **Trade-Offs:**
  - **Pros:** Preserves stateless JWT payload structure.
  - **Cons:** Requires a new table and background synchronization loop; complex recovery race conditions.

---

## 5. Refresh-Token Revocation & `revokedAt` Findings

1. **Inspection Results:**
   - Database table: `refresh_tokens`
   - Existing columns: `id`, `userId`, `tokenHash`, `expiresAt`, `isRevoked`, `createdAt`.
   - **`revokedAt` does not exist in PostgreSQL or `schema.prisma`.**
2. **Root Cause of Phase 19.10 Report:**
   - In Phase 19.10, the test probe inspected `storedToken.revokedAt`, which returned `null` / `undefined` because the column was never part of the database model.
3. **Convention:**
   - The established database convention in this project is `isRevoked: Boolean` (default `false`, updated to `true` upon revocation).
   - Per safety requirements ("First inspect the schema and existing conventions; avoid unnecessary changes. Do not run migrations..."), revocation updates should continue to set `{ isRevoked: true }`.

---

## 6. Real Redis Integration Status

- **Status:** **BLOCKED — REAL REDIS UNAVAILABLE**
- **Test Results:** Direct TCP connection to `127.0.0.1:6379` confirmed `ECONNREFUSED`.
- **Policy Compliance:** No mock, stub, or simulated socket was reported as a real integration test. All multi-instance distributed tests (cross-instance revocation, TTL expiry in real Redis) remain blocked until an approved managed Redis service (e.g., Upstash or Render Redis with TLS `rediss://`) is provisioned.

---

## 7. Build and Database Safety Verification

- **Backend Build (`pg-backend`):** `npm run build` completed with Exit Code `0`.
- **Frontend Build (`pg`):** `npm run build` completed with Exit Code `0` (Turbopack, 37 routes).
- **Database Safety Verification:**
  - Baseline `audit_logs` count: **1,242**
  - Final `audit_logs` count: **1,242** (zero rows deleted).
  - Isolated test user and associated test tokens were cleanly removed post-test.
  - Zero database migrations or schema alterations executed.

---

## 8. Final Status and Recommended Next Action

```
========================================================================
FINAL STATUS: FAILED — SECURITY DEFECT FOUND
========================================================================
```

### Next Action:
1. Review the proposed fix options for the post-Redis-recovery access-token gap.
2. Select either **Fix Option B** (zero-migration timestamp invalidation via `updatedAt` / `iat`) or schedule an approved migration for **Fix Option A** (`tokenVersion`).
3. Provision an approved real Redis instance to unblock cross-instance distributed integration testing.
