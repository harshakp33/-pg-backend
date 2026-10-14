
// Safeguard: Refuse to execute destructive cleanup if pointing to production database
const dbUrl = process.env.DATABASE_URL || '';
if (dbUrl.includes('prod') || process.env.NODE_ENV === 'production') {
  console.error('FATAL SAFEGUARD: Integration tests cannot run against a production database.');
  process.exit(1);
}
﻿const { PrismaClient } = require('C:/Users/harsh/Downloads/pg-backend/node_modules/@prisma/client');
const jwt = require('C:/Users/harsh/Downloads/pg-backend/node_modules/jsonwebtoken');
const fs = require('fs');

const env = fs.readFileSync('C:/Users/harsh/Downloads/pg-backend/.env', 'utf8');
let jwtSecret = '';
let dbUrl = '';
env.split('\n').forEach((line) => {
  const m1 = line.match(/^\s*JWT_SECRET\s*=\s*(.*)?\s*$/);
  if (m1) jwtSecret = m1[1].trim().replace(/^['"]|['"]$/g, '');
  const m2 = line.match(/^\s*DATABASE_URL\s*=\s*(.*)?\s*$/);
  if (m2) dbUrl = m2[1].trim().replace(/^['"]|['"]$/g, '');
});
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:4000/api';
const ORG_ID = '0d65eb80-f0b1-4d96-b87f-99fbc75bbe49';
const CROSS_ORG_ID = '11111111-1111-4111-a111-111111111111';
const PROPERTY_ID = '10f6501b-487c-4118-89e7-40bccb670c05';
const RESIDENT_PROFILE_ID = 'b0b3b1c3-8c53-402a-bedf-8f2e3f0b45fa'; // Resident BlrStays
const OTHER_RESIDENT_PROFILE_ID = '00499de1-5cf5-4051-b57c-ec705938746f'; // Rohan Gupta

const USERS = {
  OWNER: { email: 'owner@blrstays.com', userId: 'c9b7c9e5-a3f9-4072-89b8-f84cd21edd98' },
  MANAGER: { email: 'manager@blrstays.com', userId: 'cd01d46f-89e5-4ded-b3cb-590b3c47effa' },
  ACCOUNTANT: { email: 'accountant@blrstays.com', userId: 'e4af3ac7-d062-4dd4-90f3-2ba31213635a' },
  STAFF: { email: 'staff@blrstays.com', userId: '2f36f7ff-70da-453f-ba38-cd4f90be2035' },
  RESIDENT: { email: 'resident@blrstays.com', userId: '182f4fd2-5886-42f9-8bff-e6114e74f254' },
};

function createToken(userId, email) {
  return jwt.sign({ sub: userId, email }, jwtSecret, { expiresIn: '1h' });
}

const tokens = {
  OWNER: createToken(USERS.OWNER.userId, USERS.OWNER.email),
  MANAGER: createToken(USERS.MANAGER.userId, USERS.MANAGER.email),
  ACCOUNTANT: createToken(USERS.ACCOUNTANT.userId, USERS.ACCOUNTANT.email),
  STAFF: createToken(USERS.STAFF.userId, USERS.STAFF.email),
  RESIDENT: createToken(USERS.RESIDENT.userId, USERS.RESIDENT.email),
};

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function request(method, path, body = null, token = null, orgId = ORG_ID) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (orgId) headers['X-Organization-Id'] = orgId;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, data };
}

async function run() {
  console.log('=== STARTING PHASE 13 COMPREHENSIVE TEST SUITE ===\n');

  const runId = Date.now().toString().slice(-6);
  const createdVisitorIds = [];

  // ==========================================
  // SECTION A: AUTHENTICATION
  // ==========================================
  console.log('--- SECTION A: AUTHENTICATION ---');
  for (const role of Object.keys(tokens)) {
    assert(!!tokens[role], `${role} JWT signed successfully`);
  }

  // ==========================================
  // SECTION B: VISITOR CRUD
  // ==========================================
  console.log('\n--- SECTION B: VISITOR CRUD ---');
  // 6. Create visitor
  const visitorPayload = {
    visitorName: `Aakash Verma ${runId}`,
    phone: '+919876500001',
    propertyId: PROPERTY_ID,
    residentId: OTHER_RESIDENT_PROFILE_ID,
    purpose: 'FRIEND_VISIT',
    idType: 'AADHAAR',
    idNumber: '1234-5678-9012',
    vehicleNumber: 'KA-01-AB-1234',
    expectedDate: '2026-10-15',
    notes: 'Visiting for weekend project',
  };

  const createRes = await request('POST', '/visitors', visitorPayload, tokens.OWNER);
  assert(createRes.status === 201, 'POST /visitors by OWNER -> 201 Created');
  const createdVisitor = createRes.data?.data || createRes.data;
  assert(createdVisitor?.visitorName === visitorPayload.visitorName, 'Created visitor name matches');
  assert(createdVisitor?.status === 'EXPECTED', 'Default status is EXPECTED');
  if (createdVisitor?.id) createdVisitorIds.push(createdVisitor.id);

  // 7. Get visitor
  const getRes = await request('GET', `/visitors/${createdVisitor.id}`, null, tokens.OWNER);
  assert(getRes.status === 200, 'GET /visitors/:id by OWNER -> 200 OK');
  const fetchedVisitor = getRes.data?.data || getRes.data;
  assert(fetchedVisitor?.id === createdVisitor.id, 'Retrieved visitor ID matches');
  assert(fetchedVisitor?.properties?.id === PROPERTY_ID, 'Visitor includes property details');
  assert(fetchedVisitor?.residents?.id === OTHER_RESIDENT_PROFILE_ID, 'Visitor includes resident details');

  // 8. List visitors
  const listRes = await request('GET', '/visitors', null, tokens.OWNER);
  assert(listRes.status === 200, 'GET /visitors by OWNER -> 200 OK');
  const listData = listRes.data?.data || listRes.data;
  assert(Array.isArray(listData?.items), 'Returned list has items array');
  assert(listData?.items?.length >= 1, 'Items array contains created visitor');
  assert(listData?.meta?.total >= 1, 'Total count is >= 1');

  // 9. Pagination
  const pageRes = await request('GET', '/visitors?page=1&limit=1', null, tokens.OWNER);
  assert(pageRes.status === 200, 'GET /visitors with pagination -> 200 OK');
  const pageData = pageRes.data?.data || pageRes.data;
  assert(pageData?.items?.length <= 1, 'Items count <= limit');
  assert(pageData?.meta?.page === 1, 'meta.page is 1');
  assert(pageData?.meta?.limit === 1, 'meta.limit is 1');
  assert(pageData?.meta?.totalPages >= 1, 'meta.totalPages is computed');

  // 10. Filtering
  const filterPRes = await request('GET', `/visitors?purpose=FRIEND_VISIT`, null, tokens.OWNER);
  assert(filterPRes.status === 200, 'Filter by purpose=FRIEND_VISIT -> 200 OK');
  const filterPItems = (filterPRes.data?.data || filterPRes.data)?.items;
  assert(filterPItems.every((v) => v.purpose === 'FRIEND_VISIT'), 'All filtered items have purpose FRIEND_VISIT');

  const filterSearchRes = await request('GET', `/visitors?search=${runId}`, null, tokens.OWNER);
  assert(filterSearchRes.status === 200, 'Filter by search keyword -> 200 OK');
  const searchItems = (filterSearchRes.data?.data || filterSearchRes.data)?.items;
  assert(searchItems.some((v) => v.id === createdVisitor.id), 'Search keyword matched created visitor');

  // 11. Update visitor
  const updatePayload = {
    vehicleNumber: 'KA-01-ZZ-9999',
    notes: 'Updated vehicle number at gate',
  };
  const updateRes = await request('PATCH', `/visitors/${createdVisitor.id}`, updatePayload, tokens.MANAGER);
  assert(updateRes.status === 200, 'PATCH /visitors/:id by MANAGER -> 200 OK');
  const updatedVisitor = updateRes.data?.data || updateRes.data;
  assert(updatedVisitor?.vehicleNumber === updatePayload.vehicleNumber, 'Updated vehicle number verified');
  assert(updatedVisitor?.notes === updatePayload.notes, 'Updated notes verified');

  // 12. Delete/archive visitor
  const tempVisitorPayload = {
    visitorName: `Temp To Delete ${runId}`,
    phone: '+919876500009',
    propertyId: PROPERTY_ID,
    residentId: OTHER_RESIDENT_PROFILE_ID,
  };
  const tempVRes = await request('POST', '/visitors', tempVisitorPayload, tokens.OWNER);
  const tempV = tempVRes.data?.data || tempVRes.data;
  const deleteRes = await request('DELETE', `/visitors/${tempV.id}`, null, tokens.OWNER);
  assert(deleteRes.status === 200, 'DELETE /visitors/:id by OWNER -> 200 OK');
  const getDeleted = await request('GET', `/visitors/${tempV.id}`, null, tokens.OWNER);
  assert(getDeleted.status === 404, 'Deleted visitor returns 404 Not Found');

  // ==========================================
  // SECTION C: CHECK-IN / CHECK-OUT WORKFLOW
  // ==========================================
  console.log('\n--- SECTION C: CHECK-IN / CHECK-OUT WORKFLOW ---');
  // 13. Valid check-in
  const checkInRes = await request('POST', `/visitors/${createdVisitor.id}/check-in`, {}, tokens.STAFF);
  assert(checkInRes.status === 200, 'POST /visitors/:id/check-in by STAFF -> 200 OK');
  const checkedInV = checkInRes.data?.data || checkInRes.data;
  assert(checkedInV?.status === 'CHECKED_IN', 'Visitor status is CHECKED_IN');
  assert(checkedInV?.entryTime !== null, 'Visitor entryTime timestamp is recorded');

  // 14. Duplicate check-in rejection
  const dupCheckInRes = await request('POST', `/visitors/${createdVisitor.id}/check-in`, {}, tokens.STAFF);
  assert(dupCheckInRes.status === 400, 'Duplicate check-in rejected -> 400 Bad Request');

  // 15. Valid check-out
  const checkOutRes = await request('POST', `/visitors/${createdVisitor.id}/check-out`, {}, tokens.STAFF);
  assert(checkOutRes.status === 200, 'POST /visitors/:id/check-out by STAFF -> 200 OK');
  const checkedOutV = checkOutRes.data?.data || checkOutRes.data;
  assert(checkedOutV?.status === 'CHECKED_OUT', 'Visitor status is CHECKED_OUT');
  assert(checkedOutV?.exitTime !== null, 'Visitor exitTime timestamp is recorded');

  // 16. Duplicate check-out rejection
  const dupCheckOutRes = await request('POST', `/visitors/${createdVisitor.id}/check-out`, {}, tokens.STAFF);
  assert(dupCheckOutRes.status === 400, 'Duplicate check-out rejected -> 400 Bad Request');

  // 17. Invalid workflow transition (attempt check-in after check-out)
  const reCheckInRes = await request('POST', `/visitors/${createdVisitor.id}/check-in`, {}, tokens.STAFF);
  assert(reCheckInRes.status === 400, 'Check-in after check-out rejected -> 400 Bad Request');

  // ==========================================
  // SECTION D: RESIDENT VISITOR ISOLATION
  // ==========================================
  console.log('\n--- SECTION D: RESIDENT VISITOR ISOLATION ---');
  // 18. Resident creates own visitor and sees it
  const resOwnVisitorPayload = {
    visitorName: `Resident Cousin ${runId}`,
    phone: '+919876543219',
    purpose: 'PARENT_VISIT',
    expectedDate: '2026-10-18',
    notes: 'Family visit',
  };
  const resCreateVRes = await request('POST', '/visitors', resOwnVisitorPayload, tokens.RESIDENT);
  assert(resCreateVRes.status === 201, 'POST /visitors by RESIDENT -> 201 Created');
  const resOwnV = resCreateVRes.data?.data || resCreateVRes.data;
  assert(resOwnV?.residentId === RESIDENT_PROFILE_ID, 'Resident visitor auto-scoped to authenticated resident ID');
  assert(resOwnV?.propertyId === PROPERTY_ID, 'Resident visitor auto-scoped to resident property ID');
  if (resOwnV?.id) createdVisitorIds.push(resOwnV.id);

  // Resident lists visitors -> must see own visitor
  const resListRes = await request('GET', '/visitors', null, tokens.RESIDENT);
  assert(resListRes.status === 200, 'GET /visitors by RESIDENT -> 200 OK');
  const resListItems = (resListRes.data?.data || resListRes.data)?.items;
  assert(resListItems.some((v) => v.id === resOwnV.id), 'Resident list contains own visitor');

  // 19. Resident cannot see another resident's visitor
  assert(!resListItems.some((v) => v.id === createdVisitor.id), 'Resident list does NOT contain other resident visitor');
  const resGetOtherV = await request('GET', `/visitors/${createdVisitor.id}`, null, tokens.RESIDENT);
  assert(resGetOtherV.status === 404, 'Resident accessing another resident visitor -> 404 Not Found');

  // 20. Resident cannot modify administrative visitor records or check-in/out
  const resCheckIn = await request('POST', `/visitors/${resOwnV.id}/check-in`, {}, tokens.RESIDENT);
  assert(resCheckIn.status === 403, 'Resident check-in -> 403 Forbidden');

  const resCheckOut = await request('POST', `/visitors/${resOwnV.id}/check-out`, {}, tokens.RESIDENT);
  assert(resCheckOut.status === 403, 'Resident check-out -> 403 Forbidden');

  const resPatchV = await request('PATCH', `/visitors/${resOwnV.id}`, { notes: 'Hacked' }, tokens.RESIDENT);
  assert(resPatchV.status === 403, 'Resident modifying visitor record -> 403 Forbidden');

  // ==========================================
  // SECTION E: ORGANIZATION & PROPERTY ISOLATION
  // ==========================================
  console.log('\n--- SECTION E: ORGANIZATION & PROPERTY ISOLATION ---');
  // 21. Non-member organization header rejected -> 403
  const foreignOrgRes = await request('GET', '/visitors', null, tokens.OWNER, CROSS_ORG_ID);
  assert(foreignOrgRes.status === 403, 'Non-member organization header -> 403 Forbidden');

  // 22. Cross-organization visitor rejected -> 404
  const crossOrgVisitorRes = await request('GET', `/visitors/${CROSS_ORG_ID}`, null, tokens.OWNER);
  assert(crossOrgVisitorRes.status === 404, 'Cross-org / non-existent visitor -> 404 Not Found');

  // 23. Cross-property visitor rejected -> 404
  const crossPropV = await request('POST', '/visitors', {
    visitorName: 'Cross Prop Hacker',
    phone: '+919999999999',
    propertyId: CROSS_ORG_ID,
    residentId: OTHER_RESIDENT_PROFILE_ID,
  }, tokens.OWNER);
  assert(crossPropV.status === 404, 'Visitor with cross-org property -> 404 Not Found');

  // ==========================================
  // SECTION F: SECURITY & VALIDATION
  // ==========================================
  console.log('\n--- SECTION F: SECURITY & VALIDATION ---');
  // 24. Missing JWT -> 401
  const noJwtRes = await request('GET', '/visitors', null, null);
  assert(noJwtRes.status === 401, 'Missing JWT -> 401 Unauthorized');

  // 25. Missing X-Organization-Id -> 400
  const noOrgRes = await request('GET', '/visitors', null, tokens.OWNER, null);
  assert(noOrgRes.status === 400, 'Missing X-Organization-Id -> 400 Bad Request');

  // 26. Invalid organization UUID -> 400
  const invalidOrgRes = await request('GET', '/visitors', null, tokens.OWNER, 'not-a-valid-uuid');
  assert(invalidOrgRes.status === 400, 'Invalid X-Organization-Id format -> 400 Bad Request');

  // 27. Invalid visitor UUID -> 400
  const invalidVUuid = await request('GET', '/visitors/not-a-valid-uuid', null, tokens.OWNER);
  assert(invalidVUuid.status === 400, 'Invalid visitor UUID param -> 400 Bad Request');

  // 28. Invalid enum -> 400
  const badEnumRes = await request('POST', '/visitors', {
    visitorName: 'Bad Enum Visitor',
    phone: '+919876543210',
    propertyId: PROPERTY_ID,
    residentId: OTHER_RESIDENT_PROFILE_ID,
    purpose: 'SPACE_TRAVEL',
  }, tokens.OWNER);
  assert(badEnumRes.status === 400, 'Invalid purpose enum -> 400 Bad Request');

  // 29. Missing required field -> 400
  const missingPhoneRes = await request('POST', '/visitors', {
    visitorName: 'Missing Phone Visitor',
    propertyId: PROPERTY_ID,
    residentId: OTHER_RESIDENT_PROFILE_ID,
  }, tokens.OWNER);
  assert(missingPhoneRes.status === 400, 'Missing required phone -> 400 Bad Request');

  // 30. Unknown payload field -> 400
  const unknownFieldRes = await request('POST', '/visitors', {
    visitorName: 'Strict Check Visitor',
    phone: '+919876543210',
    propertyId: PROPERTY_ID,
    residentId: OTHER_RESIDENT_PROFILE_ID,
    maliciousField: 'payload-injection',
  }, tokens.OWNER);
  assert(unknownFieldRes.status === 400, 'Non-whitelisted field in payload -> 400 Bad Request');

  // ==========================================
  // SECTION G: RBAC ACROSS ALL FIVE ROLES
  // ==========================================
  console.log('\n--- SECTION G: RBAC ACROSS ALL FIVE ROLES ---');
  // 31. OWNER permissions: full CRUD + check-in/out
  assert(createRes.status === 201, 'OWNER has visitor creation permission');

  // 32. MANAGER permissions: full CRUD + check-in/out
  const mgrVPayload = {
    visitorName: `Manager Created Visitor ${runId}`,
    phone: '+919876500002',
    propertyId: PROPERTY_ID,
    residentId: OTHER_RESIDENT_PROFILE_ID,
  };
  const mgrVCreateRes = await request('POST', '/visitors', mgrVPayload, tokens.MANAGER);
  assert(mgrVCreateRes.status === 201, 'MANAGER has visitor creation permission');
  const mgrV = mgrVCreateRes.data?.data || mgrVCreateRes.data;
  if (mgrV?.id) createdVisitorIds.push(mgrV.id);

  // 33. STAFF permissions: check-in, check-out, view, update
  assert(checkInRes.status === 200, 'STAFF has check-in permission');
  assert(checkOutRes.status === 200, 'STAFF has check-out permission');
  const staffList = await request('GET', '/visitors', null, tokens.STAFF);
  assert(staffList.status === 200, 'STAFF has visitor list viewing permission');
  const staffDelete = await request('DELETE', `/visitors/${mgrV.id}`, null, tokens.STAFF);
  assert(staffDelete.status === 403, 'STAFF cannot delete visitor records -> 403 Forbidden');

  // 34. ACCOUNTANT denial
  const accList = await request('GET', '/visitors', null, tokens.ACCOUNTANT);
  assert(accList.status === 403, 'ACCOUNTANT listing visitors -> 403 Forbidden');

  const accCreate = await request('POST', '/visitors', visitorPayload, tokens.ACCOUNTANT);
  assert(accCreate.status === 403, 'ACCOUNTANT creating visitor -> 403 Forbidden');

  const accCheckIn = await request('POST', `/visitors/${mgrV.id}/check-in`, {}, tokens.ACCOUNTANT);
  assert(accCheckIn.status === 403, 'ACCOUNTANT check-in -> 403 Forbidden');

  const accCheckOut = await request('POST', `/visitors/${mgrV.id}/check-out`, {}, tokens.ACCOUNTANT);
  assert(accCheckOut.status === 403, 'ACCOUNTANT check-out -> 403 Forbidden');

  const accDelete = await request('DELETE', `/visitors/${mgrV.id}`, null, tokens.ACCOUNTANT);
  assert(accDelete.status === 403, 'ACCOUNTANT deleting visitor -> 403 Forbidden');

  // 35. RESIDENT restrictions
  const resDelete = await request('DELETE', `/visitors/${resOwnV.id}`, null, tokens.RESIDENT);
  assert(resDelete.status === 403, 'RESIDENT deleting visitor -> 403 Forbidden');

  // ==========================================
  // SECTION H: AUDIT LOGGING
  // ==========================================
  console.log('\n--- SECTION H: AUDIT LOGGING ---');
  const auditLogs = await prisma.audit_logs.findMany({
    where: {
      organizationId: ORG_ID,
      entityType: 'visitors',
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const actions = auditLogs.map((l) => l.action);
  console.log('  Audit log actions recorded for visitors:', Array.from(new Set(actions)));
  // 36. visitor.created
  assert(actions.includes('visitor.created'), 'Audit log contains visitor.created');
  // 37. visitor.updated
  assert(actions.includes('visitor.updated'), 'Audit log contains visitor.updated');
  // 38. visitor.check_in
  assert(actions.includes('visitor.check_in'), 'Audit log contains visitor.check_in');
  // 39. visitor.check_out
  assert(actions.includes('visitor.check_out'), 'Audit log contains visitor.check_out');
  // 40. visitor.deleted
  assert(actions.includes('visitor.deleted'), 'Audit log contains visitor.deleted');

  // ==========================================
  // SECTION I: DATA INTEGRITY
  // ==========================================
  console.log('\n--- SECTION I: DATA INTEGRITY ---');
  // 41. Zero orphan visitor references
  const allVisitors = await prisma.visitors.findMany({
    where: { organizationId: ORG_ID },
    select: { id: true, propertyId: true, residentId: true },
  });
  let orphanFound = false;
  for (const v of allVisitors) {
    const prop = await prisma.properties.findUnique({ where: { id: v.propertyId } });
    const res = await prisma.residents.findUnique({ where: { id: v.residentId } });
    if (!prop || !res) {
      orphanFound = true;
      break;
    }
  }
  assert(!orphanFound, 'Zero orphan visitor references in database');

  // 42. Invalid resident relation rejected
  const badResidentV = await request('POST', '/visitors', {
    visitorName: 'Bad Resident Test',
    phone: '+919876543210',
    propertyId: PROPERTY_ID,
    residentId: CROSS_ORG_ID,
  }, tokens.OWNER);
  assert(badResidentV.status === 404, 'Invalid resident reference rejected -> 404 Not Found');

  // 43. Invalid property relation rejected
  const badPropV = await request('POST', '/visitors', {
    visitorName: 'Bad Property Test',
    phone: '+919876543210',
    propertyId: CROSS_ORG_ID,
    residentId: OTHER_RESIDENT_PROFILE_ID,
  }, tokens.OWNER);
  assert(badPropV.status === 404, 'Invalid property reference rejected -> 404 Not Found');

  // ==========================================
  // SECTION J: CONCURRENCY
  // ==========================================
  console.log('\n--- SECTION J: CONCURRENCY ---');
  // Create a fresh visitor for concurrency test
  const concVPayload = {
    visitorName: `Concurrency Visitor ${runId}`,
    phone: '+919876500099',
    propertyId: PROPERTY_ID,
    residentId: OTHER_RESIDENT_PROFILE_ID,
  };
  const concVRes = await request('POST', '/visitors', concVPayload, tokens.OWNER);
  const concV = concVRes.data?.data || concVRes.data;
  if (concV?.id) createdVisitorIds.push(concV.id);

  // 44. Concurrent check-in
  const [ci1, ci2] = await Promise.all([
    request('POST', `/visitors/${concV.id}/check-in`, {}, tokens.STAFF),
    request('POST', `/visitors/${concV.id}/check-in`, {}, tokens.STAFF),
  ]);
  const ciSuccessCount = (ci1.status === 200 ? 1 : 0) + (ci2.status === 200 ? 1 : 0);
  const ciFailCount = (ci1.status === 400 ? 1 : 0) + (ci2.status === 400 ? 1 : 0);
  assert(ciSuccessCount === 1 && ciFailCount === 1, 'Concurrent check-in handled: exactly 1 succeeds (200), 1 rejected (400)');

  // 45. Concurrent check-out
  const [co1, co2] = await Promise.all([
    request('POST', `/visitors/${concV.id}/check-out`, {}, tokens.STAFF),
    request('POST', `/visitors/${concV.id}/check-out`, {}, tokens.STAFF),
  ]);
  const coSuccessCount = (co1.status === 200 ? 1 : 0) + (co2.status === 200 ? 1 : 0);
  const coFailCount = (co1.status === 400 ? 1 : 0) + (co2.status === 400 ? 1 : 0);
  assert(coSuccessCount === 1 && coFailCount === 1, 'Concurrent check-out handled: exactly 1 succeeds (200), 1 rejected (400)');

  // ==========================================
  // CLEANUP TEST ARTIFACTS
  // ==========================================
  console.log('\n--- CLEANUP TEST ARTIFACTS ---');
  if (createdVisitorIds.length > 0) {
    await prisma.visitors.deleteMany({
      where: { id: { in: createdVisitorIds } },
    });
    console.log(`  Cleaned up ${createdVisitorIds.length} test visitors`);
  }

  if (createdVisitorIds.length > 0) {
    await prisma.audit_logs.deleteMany({
      where: {
        organizationId: ORG_ID,
        entityId: { in: createdVisitorIds },
      },
    });
    console.log('  Cleaned up audit logs scoped to created test visitor IDs');
  }

  console.log('\n==========================================');
  console.log('PHASE 13 TEST RESULTS');
  console.log('==========================================');
  console.log(`TOTAL TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('==========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run()
  .catch((e) => {
    console.error('Test execution error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
