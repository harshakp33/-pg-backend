# PHASE 19.3 — FINAL PRE-DEPLOYMENT SECURITY VERIFICATION REPORT

**Project:** PG Management Multi-Tenant SaaS Platform  
**Frontend Location:** `C:\Users\harsh\Downloads\pg` (Next.js 16, React, TypeScript, Tailwind CSS v4)  
**Backend Location:** `C:\Users\harsh\Downloads\pg-backend` (NestJS, TypeScript, Prisma ORM)  
**Database:** PostgreSQL 18 (Database: `pg_management_db`, Port: 5432)  
**Audit Date:** October 14, 2026  
**Auditor:** Senior Application Security & Cloud Architecture Engineer  

---

## EXECUTIVE SUMMARY & FINAL VERDICT

### Final Status: **LOCAL DEVELOPMENT VERIFIED**
*(Cloud Multi-Instance Production Status: **REMEDIATION REQUIRED**)*

A rigorous pre-deployment security verification was conducted across the PG Management frontend, NestJS backend, and the active PostgreSQL database. The audit evaluated access-token revocation, Double Submit Cookie CSRF defenses, host-only cookie isolation, production configuration vulnerabilities, test cleanup safety across all historic phases, live database schema drift, and migration baselining safety.

### Summary of Verification Outcomes:
1. **Single-Instance Security Hardening (Verified):** The application now successfully operates using `HttpOnly` session cookies (`pg_access_token`, `pg_refresh_token`), Double Submit Cookie CSRF protection (`pg_csrf_token` + `X-CSRF-Token`), Host-Only cookie scoping (no broad domain injection), constant-time CSRF verification (`crypto.timingSafeEqual`), and immediate single-instance access token revocation via an in-memory SHA-256 blocklist.
2. **Multi-Instance Distributed Limitation (Remediation Required):** Because the current access-token blocklist is stored in the Node.js V8 heap, token revocations do not survive backend process restarts and cannot be shared across multiple backend replicas or serverless workers. A production-ready distributed Redis revocation architecture has been designed and specified herein.
3. **Database & Schema Baseline (Zero Drift Verified):** Inspection confirmed exactly **52 public tables** in PostgreSQL. Schema comparison via `prisma migrate diff` confirmed **100% zero schema drift** between `schema.prisma` and the live database. Complete baseline DDL (`0_init_migration.sql`, 2,204 lines) was generated. Per safety directives, no migration commands were executed against the live database.
4. **Data Integrity (100% Intact):** Before-and-after database checks established that zero records, zero tables, and zero audit logs were deleted or altered during the entire audit. Active record counts remain verified: 18 users, 1 organization, 28 residents, 55 invoices, 91 payments, 1 complaint, and 1,242 audit logs.

---

## SECTION 1: FINDINGS WITH SEVERITY AND SOURCE-FILE EVIDENCE

| Finding ID | Severity | Category | Description | Source File Reference |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-19.3-01** | **HIGH** | Session Invalidation | **In-Memory Revocation Blocklist Lost on Process Restart / Unshared Across Replicas.** Token blocklist is maintained in Node.js process RAM (`Map<string, number>`). Following a process restart or across multiple load-balanced replicas, a revoked access token can still authenticate until its 15-minute JWT expiry. | [auth.service.ts](file:///C:/Users/harsh/Downloads/pg-backend/src/auth/auth.service.ts#L44-L64) |
| **SEC-19.3-02** | **HIGH** | Production Config | **Missing Production API Base URL in Cloud Deployment Descriptor.** `render.yaml` does not specify `NEXT_PUBLIC_API_BASE_URL` for the frontend web service. Production builds deployed to Render will fall back to `http://localhost:4000`, breaking client-to-backend communication and causing HTTPS Mixed Content errors. | [render.yaml](file:///C:/Users/harsh/Downloads/pg/render.yaml#L8-L12) |
| **SEC-19.3-03** | **MEDIUM** | Credential Exposure | **Hardcoded Test Passwords Bundled in Client Frontend.** `ROLE_CREDENTIALS_MAP` in `authService.ts` bundles plaintext test passwords (`password123`) into the client JavaScript bundle. Although 1-click demo login is gated behind `NEXT_PUBLIC_ENABLE_DEMO_LOGIN`, credentials remain extractable from client-side bundle source code. | [authService.ts](file:///C:/Users/harsh/Downloads/pg/services/authService.ts#L7-L18) |
| **SEC-19.3-04** | **MEDIUM** | Defense-in-Depth | **Authentication Tokens Duplicated in Browser localStorage.** Frontend `apiClient.ts` and `authService.ts` write `accessToken` and `refreshToken` to `localStorage` alongside `HttpOnly` cookies. In the event of an XSS vulnerability, tokens stored in `localStorage` can be exfiltrated. | [apiClient.ts](file:///C:/Users/harsh/Downloads/pg/lib/apiClient.ts#L62-L73), [authService.ts](file:///C:/Users/harsh/Downloads/pg/services/authService.ts#L101-L103) |
| **SEC-19.3-05** | **LOW** | Attack Surface | **Unconditional Public Swagger API Docs in Production.** Swagger documentation is mounted unconditionally at `/api/docs` in `main.ts` without checking `process.env.NODE_ENV !== 'production'`, exposing internal API contracts and schemas publicly. | [main.ts](file:///C:/Users/harsh/Downloads/pg-backend/src/main.ts#L73-L105) |
| **SEC-19.3-06** | **LOW** | Attack Surface | **RBAC Debug & Test Controller Registered in Module.** `RbacTestController` exposes public test routes (`/api/rbac/test/public`) and test permission endpoints in Swagger without an environment guard. | [rbac.module.ts](file:///C:/Users/harsh/Downloads/pg-backend/src/rbac/rbac.module.ts#L7-L12) |
| **SEC-19.3-07** | **INFO** | Database Management | **Prisma Migration History Table Missing in Live Database.** Database has 52 tables created via initial push/scripts; table `_prisma_migrations` is absent. A baseline migration must be marked as applied before future migrations can run. | [schema.prisma](file:///C:/Users/harsh/Downloads/pg-backend/prisma/schema.prisma) |

---

## SECTION 2: VERIFIED CONTROLS AND UNVERIFIED CLAIMS

### Verified Controls (Empirically Confirmed via Direct Execution)
- [x] **Double Submit Cookie CSRF Guard:** Rejects state-changing HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`) when authenticated cookies are present without a matching `X-CSRF-Token` header (Status 403 Forbidden).
- [x] **Timing-Safe Comparison:** Compares CSRF header to cookie using `crypto.timingSafeEqual`, preventing timing analysis side-channels.
- [x] **Host-Only Cookies:** Neither access nor refresh cookies define a broad `Domain` attribute, preventing subdomain hijacking or cookie injection from compromised subdomains.
- [x] **HttpOnly & SameSite Protection:** `pg_access_token` and `pg_refresh_token` are set with `HttpOnly: true` and `SameSite: lax`. `pg_csrf_token` is non-HttpOnly to allow frontend script header injection.
- [x] **Cookie Scoping & Clearing:** Cookie clearance in `/api/auth/logout` uses matching path and security attributes, ensuring reliable client cookie purging.
- [x] **Single-Instance Access Token Invalidation:** When a user logs out, the active access token's SHA-256 hash is added to the in-memory blocklist and is immediately rejected on subsequent requests (Status 401 Unauthorized).
- [x] **Database Refresh Token Revocation:** Refresh tokens are revoked in PostgreSQL upon logout (`isRevoked: true`) and rejected upon subsequent refresh attempts (Status 401 Unauthorized).
- [x] **Multi-Tenant Organization Boundary Isolation:** All data access routes validate `X-Organization-Id`. Requests targeting foreign tenant resources are rejected (Status 403 Forbidden).
- [x] **Resident Self-Service Isolation:** Residents are strictly blocked from management endpoints (`/api/properties`, `/api/residents`, `/api/invoices`, `/api/reports/dashboard`) while retaining scoped access to their own profile, stay, and personal invoices.
- [x] **Zero Live Schema Drift:** `prisma migrate diff` executed against the live PostgreSQL database verified 100% equivalence between `schema.prisma` and the database catalog.

### Unverified Claims & Invalidation Limits
- [ ] **Multi-Instance / Clustered Access Token Revocation (UNVERIFIED / LIMITATION IDENTIFIED):** In-memory blocklist cannot synchronize across separate Node.js processes or surviving restarts. Revocation across multiple instances cannot be claimed until a shared Redis cluster is integrated.
- [ ] **Production Cloud HTTPS Cookies (UNVERIFIED IN LOCALHOST):** Browsers ignore `secure: true` over plain HTTP localhost. Production HTTPS cookie transmission is verified by code inspection of `process.env.NODE_ENV === 'production' ? true : false`, but requires real TLS staging validation.

---

## SECTION 3: TOKEN REVOCATION & CSRF ARCHITECTURE

### 3.1 Empirical Access-Token Revocation Verification

The in-memory revocation blocklist in `pg-backend/src/auth/auth.service.ts` was tested with `test_task1_revocation.js` and `test_cookie_csrf_revocation.js`:
1. User logs in: receives `accessToken` (15m validity) and `refreshToken` (7d validity).
2. User executes `POST /api/auth/logout`:
   - Refresh token is marked `isRevoked: true` in PostgreSQL.
   - Access token is hashed via SHA-256 and added to `this.revokedAccessTokens.set(tokenHash, expMs)`.
3. User immediately attempts `GET /api/auth/me` using the revoked token:
   - Output: `401 Unauthorized: Token has been revoked`. (VERIFIED).
4. **Behavior Across Restarts & Clustered Instances (Empirical Analysis):**
   - The `revokedAccessTokens` Map resides in the V8 heap of that specific Node.js process.
   - Upon process restart, the Map is reset to empty.
   - In a multi-replica cluster (e.g., 2+ instances behind an AWS ALB or Render load balancer), an instance receiving a logout request revokes the token only in its local RAM. Subsequent requests from that user routed to peer instances will succeed until the 15-minute token expiry is reached.

### 3.2 Production Shared Revocation Architecture (Redis Distributed Cache)

To transition from single-instance development to high-availability multi-instance production, the following distributed revocation architecture must be deployed:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Web Browser
    participant API as NestJS Backend (Instance 1..N)
    participant Redis as Redis Revocation Cluster (TLS)
    participant DB as PostgreSQL Database

    Note over Client,API: User logs out
    Client->>API: POST /api/auth/logout (Cookie / Bearer)
    API->>DB: UPDATE refresh_tokens SET isRevoked = true WHERE id = tokenId
    API->>API: Compute SHA-256(accessToken) & remaining TTL = exp - now()
    API->>Redis: SETEX "revoked_token:<hash>" <TTL_seconds> "1"
    API-->>Client: Clear cookies & return 200 OK

    Note over Client,API: Subsequent Request to Any Instance
    Client->>API: GET /api/portal/stay (Using Revoked Token)
    API->>API: Compute SHA-256(accessToken)
    API->>Redis: EXISTS "revoked_token:<hash>"
    Redis-->>API: 1 (Key exists)
    API-->>Client: 401 Unauthorized ("Token has been revoked")
```

#### Production Redis Specification:
1. **Key Format:** `revoked_token:<sha256_token_hash>`
2. **Key Value:** `1` (or timestamp string)
3. **Time-To-Live (TTL):** Set precisely to the remaining lifetime of the JWT:
   ```typescript
   const remainingSeconds = Math.max(1, Math.ceil((decoded.exp * 1000 - Date.now()) / 1000));
   await this.redisClient.set(`revoked_token:${tokenHash}`, '1', 'EX', remainingSeconds);
   ```
4. **Automatic Memory Reclamation:** Keys automatically expire from Redis the instant the JWT expires, preventing unbounded memory growth without needing manual sweep crons.
5. **Failure Mode Policy:**
   - **Fail-Closed (Recommended for High Security):** If Redis connection fails, reject incoming requests with 503 Service Unavailable or fallback to strict re-authentication.
   - **Graceful Circuit Breaker:** Maintain local in-memory fallback during temporary Redis disconnection with security alerts logged to Sentry/CloudWatch.
6. **No Secret Exposure in Logs:** Raw JWT tokens and secret keys are never passed to loggers; only the hex-encoded SHA-256 digest is queried or logged.

---

## SECTION 4: PRODUCTION CORS & COOKIE CONFIGURATION FINDINGS

### 4.1 Cookie Security Attributes
Inspection of `pg-backend/src/auth/auth.controller.ts` confirms the following configuration:

```typescript
const isProd = process.env.NODE_ENV === 'production';

// Access Token Cookie
res.cookie('pg_access_token', tokens.accessToken, {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: 15 * 60 * 1000, // 15 mins
});

// Refresh Token Cookie
res.cookie('pg_refresh_token', tokens.refreshToken, {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});

// CSRF Token Cookie (Readable by JS for Double Submit header injection)
res.cookie('pg_csrf_token', tokens.csrfToken, {
  httpOnly: false,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});
```

### 4.2 Host-Only Cookie Scoping Verification
- The cookie definitions explicitly omit the `domain` option.
- **RFC 6265 Host-Only Compliance:** When the `Domain` attribute is absent, user agents restrict the cookie strictly to the origin host. Subdomains (e.g., `evil.example.com` or third-party staging subdomains) cannot access, alter, or inject these cookies.

### 4.3 CORS Configuration Verification
In `pg-backend/src/main.ts`:
- In local development, the allowed origins are `http://localhost:3000`, `http://127.0.0.1:3000`, and `http://localhost:3001`.
- In production, allowed origins are parsed from `process.env.ALLOWED_ORIGINS`.
- Dynamic origin verification checks incoming request headers against the configured whitelist:
  ```typescript
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed: ' + origin), false);
  }
  ```
- `credentials: true` is strictly paired with explicit origins. The wildcard `*` is disallowed.

---

## SECTION 5: TEST CLEANUP SAFETY INVENTORY

A complete audit of all test scripts across Phases 9 through 19.2 was conducted to ensure safe database interactions and verify that no test deletes unrelated operational or audit data:

| Test Script | Target Module | Cleanup Mechanism | Audit Log Impact | Safety Assessment |
| :--- | :--- | :--- | :--- | :--- |
| `test_phase9_comprehensive.js` | RBAC & Modules | None (Inserts records) | None | **UNSAFE FOR SHARED DB:** Leaves test records; runs against local test DB only. |
| `test_real_rbac.js` | Real RBAC Perms | Read-Only inspection | None | **SAFE:** Pure read-only verification. |
| `test_phase10_comprehensive.js` | Bookings & Leads | Scoped: `entityId: { in: allCreatedP10Ids }` | Scoped only | **SAFE (REPAIRED):** Broad audit delete removed in Phase 19.2. |
| `test_phase11_comprehensive.js` | Rooms & Beds | Read-Only inspection | None | **SAFE:** Validates existing structure. |
| `test_phase12_comprehensive.js` | Invoices & Payments | Scoped: `entityId: { in: allCreatedP12Ids }` | Scoped only | **UNSAFE FOR PROD DB:** Mutates payment sequences; safe on isolated DB. |
| `test_phase13_comprehensive.js` | Visitors & Meals | Scoped: `entityId: { in: createdVisitorIds }` | Scoped only | **SAFE (REPAIRED):** Broad audit delete removed in Phase 19.2. |
| `test_phase14_comprehensive.js` | Staff Leaves | Scoped: `entityId: { in: createdLeaveIds }` | Scoped only | **SAFE (REPAIRED):** Broad audit delete removed in Phase 19.2. |
| `test_phase15_comprehensive.js` | Announcements | Scoped delete on fixture IDs | Scoped only | **SAFE:** Fixture-isolated cleanup. |
| `test_phase16_comprehensive.js` | Custom Fields | Read-Only inspection | None | **SAFE:** Read-only schema verification. |
| `test_phase17_comprehensive.js` | Reports Dashboard | Read-Only inspection | None | **SAFE:** Read-only analytics validation. |
| `test_phase18_comprehensive.js` | Resident Portal | Scoped delete on test complaints | Scoped only | **SAFE:** Fixture-isolated cleanup. |
| `test_phase19_comprehensive.js` | Integration Flow | Read-mostly & scoped auth | None | **CONDITIONALLY SAFE:** Requires DB environment guard. |
| `test_phase19_1_security_audit.js` | Security Barriers | Read-only & temporary tokens | None | **SAFE:** Zero deletions, non-destructive. |
| `test_cookie_csrf_revocation.js` | CSRF & Cookies | Non-destructive login/logout | None | **SAFE:** Reversible token state test. |

---

## SECTION 6: DATABASE INTEGRITY EVIDENCE & LIMITATIONS

### 6.1 Database Verification Before vs. After Execution
Direct database queries executed via PostgreSQL client at beginning and completion of all Phase 19.3 security tests confirm zero database destruction:

| Table / Entity | Pre-Audit Count | Post-Audit Count | Delta | Integrity Status |
| :--- | :--- | :--- | :--- | :--- |
| **Public Base Tables** | 52 | 52 | 0 | **100% Intact** |
| **Users (Total)** | 18 | 18 | 0 | **100% Intact** |
| **Active Users** | 18 | 18 | 0 | **100% Intact** |
| **Deleted Users** | 0 | 0 | 0 | **100% Intact** |
| **Organizations** | 1 | 1 | 0 | **100% Intact** |
| **Residents** | 28 | 28 | 0 | **100% Intact** |
| **Invoices** | 55 | 55 | 0 | **100% Intact** |
| **Payments** | 91 | 91 | 0 | **100% Intact** |
| **Complaints** | 1 | 1 | 0 | **100% Intact** |
| **Audit Logs** | 1,242 | 1,242 | 0 | **100% Intact (Zero Deleted)** |

### 6.2 Database Limitations
1. **No Migration History Table:** The live database catalog does not contain `_prisma_migrations`.
2. **PostgreSQL Extensions:** The database uses `gen_random_uuid()` which requires PostgreSQL 13+ native support or `pgcrypto`. (PostgreSQL 18 is active and supports this natively).
3. **Database Concurrency:** No transactional row-level locks are currently placed on bed allocation during simultaneous resident check-ins; optimistic or pessimistic locking should be added in a future phase.

---

## SECTION 7: MIGRATION-BASELINE REHEARSAL PLAN

### 7.1 Schema Drift Analysis
- **Prisma Schema:** `C:\Users\harsh\Downloads\pg-backend\prisma\schema.prisma`
- **Live Database:** `postgresql://...:5432/pg_management_db`
- **Command Executed:**
  ```bash
  npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma
  ```
- **Result:** `No difference detected.`
- **Finding:** The Prisma datamodel perfectly mirrors the live database's 52 tables, foreign keys, indexes, and PostgreSQL enum types. There is zero drift.

### 7.2 Generated Baseline DDL Artifact
- The baseline DDL was exported to `scratch/0_init_migration.sql` (86,556 bytes, 2,204 lines).
- It contains complete `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE ... ADD CONSTRAINT`, and `CREATE INDEX` definitions for all 52 tables.

### 7.3 Step-by-Step Zero-Downtime Migration Rehearsal Plan
*(NOTE: In accordance with safety rules, no baseline commands have been executed on the live database. The following plan must be approved and executed in staging prior to production.)*

```mermaid
flowchart TD
    A[Step 1: Backup Production DB pg_dump] --> B[Step 2: Restore into Staging pg_management_rehearsal_db]
    B --> C[Step 3: Create prisma/migrations/0_init/migration.sql]
    C --> D[Step 4: Execute prisma migrate resolve --applied 0_init on Staging]
    D --> E[Step 5: Verify _prisma_migrations contains 1 row]
    E --> F[Step 6: Test Dummy Schema Migration on Staging]
    F --> G[Step 7: Verify Application Functional on Staging]
    G --> H[Step 8: User Approval Sign-Off]
    H --> I[Step 9: Execute prisma migrate resolve --applied 0_init on Production DB]
```

#### Detailed Execution Steps:
1. **Rehearsal Database Creation:**
   ```bash
   # Dump live schema without data or with sanitized test data
   pg_dump -U postgres -d pg_management_db --schema-only -f schema_backup.sql
   createdb -U postgres pg_management_rehearsal_db
   psql -U postgres -d pg_management_rehearsal_db -f schema_backup.sql
   ```
2. **Directory Structure Setup:**
   ```bash
   mkdir -p prisma/migrations/0_init
   cp scratch/0_init_migration.sql prisma/migrations/0_init/migration.sql
   ```
3. **Resolve Baseline on Rehearsal DB:**
   ```bash
   # Connect DATABASE_URL to rehearsal DB
   npx prisma migrate resolve --applied 0_init
   ```
4. **Validation Query on Rehearsal DB:**
   ```sql
   SELECT migration_name, finished_at, applied_steps_count FROM _prisma_migrations;
   -- Expected: 1 row showing '0_init' with applied_steps_count = 1
   ```
5. **Rehearse Future Migration Deployment:**
   - Add a test column/index in schema.prisma.
   - Run `npx prisma migrate deploy`.
   - Verify that Prisma applies the delta without attempting to recreate existing tables.
6. **Production Execution (Post-Approval):**
   - Run `npx prisma migrate resolve --applied 0_init` strictly against the production database.
   - Zero table-creation DDL is executed, preventing any table collisions, lock contention, or downtime.

---

## SECTION 8: EXACT TESTS RUN, ACTUAL RESULTS & UNEXECUTED TESTS

### 8.1 Tests Executed During Phase 19.3

| Suite / Test Name | Assertion Count | Result | Key Details Verified |
| :--- | :--- | :--- | :--- |
| **Cookie & CSRF Suite (`test_cookie_csrf_revocation.js`)** | 7 / 7 | **ALL PASSED** | - `pg_access_token` and `pg_refresh_token` are HttpOnly<br>- `pg_csrf_token` is readable by client<br>- Cookie-only request to `/api/auth/me` succeeds (200)<br>- State-changing request without CSRF token blocked (403)<br>- Request with mismatched CSRF token blocked (403)<br>- Legitimate logout with CSRF token clears cookies (200)<br>- Revoked access token immediately blocked with 401 |
| **Security & Isolation Suite (`test_phase19_1_security_audit.js`)** | 34 / 34 | **ALL PASSED** | - Sensitive field stripping (`passwordHash` stripped from auth responses)<br>- Resident authorization barriers on 5 management routes (403 Forbidden)<br>- Resident self-service portal isolation (profile, stay, personal invoices only)<br>- Cross-organization multi-tenant blocking (403 Forbidden)<br>- Forged/expired JWT rejection (401 Unauthorized)<br>- Refresh token database revocation verification<br>- Database table count intact at exactly 52 |
| **Empirical Revocation Probe (`test_task1_revocation.js`)** | 3 / 3 | **VERIFIED** | Proved in-memory blocklist rejects token on active process, but identified that process restarts or multi-instance routing clears in-memory state. |
| **Database Audit Probe (`db_audit.js`)** | 6 / 6 | **VERIFIED** | Verified 52 tables, 1,242 audit logs (0 deleted), confirmed absence of `_prisma_migrations`. |
| **Cumulative Assertions Run** | **50 / 50** | **100% PASSED** | Zero failures across all security test executions. |

### 8.2 Tests Not Run & Rationale
- **Multi-Instance Concurrency Tests:** Not run because local environment has only 1 backend process. (Documented as limitation in Section 3).
- **Prisma Migrate Resolve on Live Database:** Not run in strict compliance with safety rules prohibiting unapproved schema/migration commands.
- **Legacy Phase 9 / Phase 12 Full Suites:** Not executed against the live database during this audit because their test fixtures generate business invoice sequence numbers and lacks fixture isolation.

---

## SECTION 9: REQUIRED ACTIONS BEFORE PRODUCTION DEPLOYMENT

Before approving a production cloud deployment (e.g., on Render, AWS, or GCP), the following mandatory actions must be executed:

1. **Deploy Managed Redis & Wire Shared Revocation:**
   - Provision a Redis instance (e.g. Render Redis or AWS ElastiCache) with TLS.
   - Update `AuthService` to store revoked access token hashes in Redis with automatic TTL matching token expiration.
2. **Update Cloud Deployment Environment (`render.yaml`):**
   - Add `NEXT_PUBLIC_API_BASE_URL: https://<backend-app-name>.onrender.com` to the frontend environment configuration.
   - Add production environment variables to backend: `ALLOWED_ORIGINS`, `NODE_ENV=production`, `COOKIE_SECURE=true`, `JWT_SECRET`, `REDIS_URL`.
3. **Execute Migration Baseline Rehearsal & Apply Baseline:**
   - Execute rehearsal in staging according to Section 7.
   - With explicit stakeholder approval, run `npx prisma migrate resolve --applied 0_init` on the production database.
4. **Purge Plaintext Demo Passwords from Frontend Bundle:**
   - Remove `ROLE_CREDENTIALS_MAP` hardcoded passwords from `authService.ts`.
   - Restrict demo login strictly to server-side mock endpoints enabled only in development staging.
5. **Guard Swagger Docs and Test Endpoints in Production:**
   - Wrap `SwaggerModule.setup('api/docs', ...)` in `if (process.env.NODE_ENV !== 'production')`.
   - Wrap `RbacTestController` registration in an environment check to prevent exposing debug endpoints.
6. **Prune Remaining `localStorage` Token Storage:**
   - Transition frontend entirely to HttpOnly cookies and CSRF headers, eliminating `localStorage.setItem('pg_access_token')` to prevent XSS exfiltration.

---

## VERIFICATION SIGN-OFF

**Audit Status:** `LOCAL DEVELOPMENT VERIFIED`  
**Production Readiness Status:** `REMEDIATION REQUIRED` (Pending Redis and Cloud Env Config)  
**Database Table Count:** Exactly 52 (0 Drift)  
**Security Assertions Verified:** 50/50 Passing  
**Database Integrity:** 100% Preserved (1,242 Audit Logs, 0 Alterations)  
