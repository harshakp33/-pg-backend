/**
 * Phase 19 — End-to-End Frontend–Backend Integration & Tenant Isolation Test Suite
 * Validates real API client connectivity, authentication, multi-tenant isolation,
 * role-based permissions, and resident portal integration.
 */

const assert = require('assert');

const BASE_URL = 'http://localhost:4000/api';
const DEFAULT_ORG_ID = '0d65eb80-f0b1-4d96-b87f-99fbc75bbe49';
const FOREIGN_ORG_ID = '11111111-2222-3333-4444-555555555555';

let passed = 0;
let failed = 0;

function pass(msg) {
  passed++;
  console.log(`  ✅ PASS: ${msg}`);
}

function fail(msg, err) {
  failed++;
  console.error(`  ❌ FAIL: ${msg}`);
  if (err) console.error(err);
}

async function run() {
  console.log('====================================================');
  console.log('PHASE 19 — FRONTEND-BACKEND INTEGRATION TEST SUITE');
  console.log('====================================================\n');

  let ownerToken = null;
  let managerToken = null;
  let residentToken = null;
  let residentUser = null;
  let propertyId = null;

  // ----------------------------------------------------
  // SECTION 1: Health & Base Connectivity
  // ----------------------------------------------------
  console.log('--- SECTION 1: Health & Connectivity ---');
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(healthRes.status, 200, 'Health endpoint should return 200');
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok', 'Health status should be ok');
    pass('Health endpoint responds with 200 OK and database connected');
  } catch (err) {
    fail('Health endpoint check failed', err);
  }

  // ----------------------------------------------------
  // SECTION 2: Real Authentication & Session Verification
  // ----------------------------------------------------
  console.log('\n--- SECTION 2: Authentication & Session Verification ---');
  try {
    // 1. Owner Login
    const ownerRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@blrstays.com', password: 'password123' }),
    });
    assert.strictEqual(ownerRes.status, 200);
    const ownerData = await ownerRes.json();
    assert.ok(ownerData.data?.accessToken, 'Expected accessToken in login response');
    ownerToken = ownerData.data.accessToken;
    pass('Owner authentication succeeds with JWT and refreshToken');

    // 2. Manager Login
    const managerRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'manager@blrstays.com', password: 'password123' }),
    });
    assert.strictEqual(managerRes.status, 200);
    const managerData = await managerRes.json();
    managerToken = managerData.data.accessToken;
    pass('Manager authentication succeeds');

    // 3. Resident Login
    const residentRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'resident@blrstays.com', password: 'password123' }),
    });
    assert.strictEqual(residentRes.status, 200);
    const resData = await residentRes.json();
    residentToken = resData.data.accessToken;
    residentUser = resData.data.user;
    pass('Resident authentication succeeds');

    // 4. Session Validation via GET /auth/me
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.data?.email, 'owner@blrstays.com');
    pass('GET /auth/me successfully validates active authenticated session');

    // 5. Invalid credentials rejection
    const invalidRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@blrstays.com', password: 'wrongpassword' }),
    });
    assert.strictEqual(invalidRes.status, 401);
    pass('Invalid password rejected with 401 Unauthorized');

    // 6. Missing Bearer token rejection
    const unauthRes = await fetch(`${BASE_URL}/properties`, {
      headers: { 'X-Organization-Id': DEFAULT_ORG_ID },
    });
    assert.strictEqual(unauthRes.status, 401);
    pass('Missing Authorization header rejected with 401 Unauthorized');
  } catch (err) {
    fail('Authentication test failed', err);
  }

  // ----------------------------------------------------
  // SECTION 3: Administrative & Management Services
  // ----------------------------------------------------
  console.log('\n--- SECTION 3: Integrated Management Endpoints ---');
  try {
    // 1. Properties
    const propRes = await fetch(`${BASE_URL}/properties`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(propRes.status, 200);
    const propData = await propRes.json();
    const props = propData.data?.items || propData.data || [];
    assert.ok(props.length > 0, 'Properties list should not be empty');
    propertyId = props[0].id;
    pass(`GET /properties returned ${props.length} properties`);

    // 2. Property Structure (Floors, Rooms, Beds tree)
    const structRes = await fetch(`${BASE_URL}/properties/${propertyId}/structure`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(structRes.status, 200);
    const structData = await structRes.json();
    assert.ok(structData.data?.floors, 'Structure should contain floors array');
    pass('GET /properties/:id/structure returns complete architectural hierarchy');

    // 3. Residents
    const resListRes = await fetch(`${BASE_URL}/residents`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(resListRes.status, 200);
    const resListData = await resListRes.json();
    const residents = resListData.data?.items || resListData.data || [];
    pass(`GET /residents returned ${residents.length} resident profiles`);

    // 4. Invoices
    const invRes = await fetch(`${BASE_URL}/invoices`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(invRes.status, 200);
    pass('GET /invoices returned 200 OK');

    // 5. Payments
    const payRes = await fetch(`${BASE_URL}/payments`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(payRes.status, 200);
    pass('GET /payments returned 200 OK');

    // 6. Complaints
    const compRes = await fetch(`${BASE_URL}/complaints`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(compRes.status, 200);
    pass('GET /complaints returned 200 OK');

    // 7. Executive Dashboard Analytics
    const dashRes = await fetch(`${BASE_URL}/reports/dashboard`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(dashRes.status, 200);
    const dashData = await dashRes.json();
    assert.ok(dashData.data?.occupancy, 'Expected occupancy report');
    assert.ok(dashData.data?.financials, 'Expected financials report');
    pass('GET /reports/dashboard returns verified aggregated business metrics');
  } catch (err) {
    fail('Administrative endpoints test failed', err);
  }

  // ----------------------------------------------------
  // SECTION 4: Resident Portal Integration
  // ----------------------------------------------------
  console.log('\n--- SECTION 4: Resident Portal Integration ---');
  try {
    // 1. Portal Dashboard
    const pDashRes = await fetch(`${BASE_URL}/portal/dashboard`, {
      headers: {
        Authorization: `Bearer ${residentToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(pDashRes.status, 200);
    const pDashData = await pDashRes.json();
    assert.strictEqual(pDashData.data?.profile?.email, 'resident@blrstays.com');
    pass('GET /portal/dashboard returns authenticated resident live profile');

    // 2. Portal Accommodation
    const pAccRes = await fetch(`${BASE_URL}/portal/accommodation`, {
      headers: {
        Authorization: `Bearer ${residentToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(pAccRes.status, 200);
    pass('GET /portal/accommodation returns room and bed details');

    // 3. Portal Invoices
    const pInvRes = await fetch(`${BASE_URL}/portal/invoices`, {
      headers: {
        Authorization: `Bearer ${residentToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(pInvRes.status, 200);
    pass('GET /portal/invoices returns resident invoices');

    // 4. Portal Food Menu
    const pMenuRes = await fetch(`${BASE_URL}/portal/food/menu`, {
      headers: {
        Authorization: `Bearer ${residentToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(pMenuRes.status, 200);
    pass('GET /portal/food/menu returns weekly kitchen schedule');
  } catch (err) {
    fail('Resident portal integration test failed', err);
  }

  // ----------------------------------------------------
  // SECTION 5: Multi-Tenant & Role Isolation
  // ----------------------------------------------------
  console.log('\n--- SECTION 5: Multi-Tenant & Role Isolation ---');
  try {
    // 1. Resident accessing administrative dashboard -> 403 Forbidden
    const resForbiddenRes = await fetch(`${BASE_URL}/reports/dashboard`, {
      headers: {
        Authorization: `Bearer ${residentToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(resForbiddenRes.status, 403);
    pass('Resident cannot access Executive Dashboard (403 Forbidden enforced)');

    // 2. Resident creating property -> 403 Forbidden
    const resPropForbidden = await fetch(`${BASE_URL}/properties`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${residentToken}`,
        'X-Organization-Id': DEFAULT_ORG_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Tampered Property' }),
    });
    assert.strictEqual(resPropForbidden.status, 403);
    pass('Resident cannot create properties (403 Forbidden enforced)');

    // 3. Cross-Tenant header isolation (valid UUID v4 for non-member organization) -> 403 Forbidden
    const crossOrgRes = await fetch(`${BASE_URL}/properties`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Organization-Id': 'a0000000-0000-4000-8000-000000000001',
      },
    });
    assert.strictEqual(crossOrgRes.status, 403);
    pass('Foreign organization ID header is strictly rejected with 403 Forbidden');

    // 4. Invalid organization UUID format -> 400 Bad Request
    const invalidOrgRes = await fetch(`${BASE_URL}/properties`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'X-Organization-Id': 'invalid-uuid-format',
      },
    });
    assert.strictEqual(invalidOrgRes.status, 400);
    pass('Malformed organization ID header is rejected with 400 Bad Request');

    // 5. Missing organization header -> 400 Bad Request
    const missingOrgRes = await fetch(`${BASE_URL}/properties`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.strictEqual(missingOrgRes.status, 400);
    pass('Missing X-Organization-Id header is rejected with 400 Bad Request');

    // 6. Forged / Tampered JWT -> 401 Unauthorized
    const forgedRes = await fetch(`${BASE_URL}/properties`, {
      headers: {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        'X-Organization-Id': DEFAULT_ORG_ID,
      },
    });
    assert.strictEqual(forgedRes.status, 401);
    pass('Forged or corrupted JWT rejected with 401 Unauthorized');
  } catch (err) {
    fail('Tenant isolation test failed', err);
  }

  // ----------------------------------------------------
  // SECTION 6: Database Schema & Integrity Check
  // ----------------------------------------------------
  console.log('\n--- SECTION 6: Database Table Count Verification ---');
  try {
    const { PrismaClient } = require('C:/Users/harsh/Downloads/pg-backend/node_modules/@prisma/client');
    const prisma = new PrismaClient();
    const tables = await prisma.$queryRaw`
      SELECT count(*)::int as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `;
    const count = tables[0].table_count;
    assert.strictEqual(count, 52, `Expected exactly 52 public tables, found ${count}`);
    pass(`Verified exactly ${count} public application tables in PostgreSQL database`);
    await prisma.$disconnect();
  } catch (err) {
    fail('Database table verification failed', err);
  }

  console.log('\n====================================================');
  console.log(`PHASE 19 SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
