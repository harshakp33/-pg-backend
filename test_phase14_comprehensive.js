
// Safeguard: Refuse to execute destructive cleanup if pointing to production database
const dbUrl = process.env.DATABASE_URL || '';
if (dbUrl.includes('prod') || process.env.NODE_ENV === 'production') {
  console.error('FATAL SAFEGUARD: Integration tests cannot run against a production database.');
  process.exit(1);
}
const { PrismaClient } = require('C:/Users/harsh/Downloads/pg-backend/node_modules/@prisma/client');
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
const RESIDENT_PROFILE_ID = 'b0b3b1c3-8c53-402a-bedf-8f2e3f0b45fa';
const OTHER_RESIDENT_PROFILE_ID = '00499de1-5cf5-4051-b57c-ec705938746f';

const USERS = {
  OWNER: { email: 'owner@blrstays.com', userId: 'c9b7c9e5-a3f9-4072-89b8-f84cd21edd98' },
  MANAGER: { email: 'manager@blrstays.com', userId: 'cd01d46f-89e5-4ded-b3cb-590b3c47effa' },
  ACCOUNTANT: { email: 'accountant@blrstays.com', userId: 'e4af3ac7-d062-4dd4-90f3-2ba31213635a' },
  STAFF: { email: 'staff@blrstays.com', userId: '2f36f7ff-70da-453f-ba38-cd4f90be2035' },
  RESIDENT: { email: 'resident@blrstays.com', userId: '182f4fd2-5886-42f9-8bff-e6114e74f254' },
};

const tokens = {};
for (const [role, u] of Object.entries(USERS)) {
  tokens[role] = jwt.sign(
    { sub: u.userId, email: u.email, role },
    jwtSecret,
    { expiresIn: '1h' },
  );
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ? PASS: ${message}`);
    passed++;
  } else {
    console.log(`  ? FAIL: ${message}`);
    failed++;
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
  console.log('=== STARTING PHASE 14 COMPREHENSIVE TEST SUITE ===\n');
  // Removed un-scoped initial audit log deletion

  const runId = Date.now().toString().slice(-6);
  const createdLeaveIds = [];

  // ==========================================
  // SECTION A: AUTHENTICATION
  // ==========================================
  console.log('--- SECTION A: AUTHENTICATION ---');
  for (const role of Object.keys(tokens)) {
    assert(!!tokens[role], `${role} JWT signed successfully`);
  }

  // ==========================================
  // SECTION B: LEAVE CRUD
  // ==========================================
  console.log('\n--- SECTION B: LEAVE CRUD ---');
  // 6. Resident creates leave
  const leavePayload = {
    startDate: '2026-11-01',
    endDate: '2026-11-05',
    reason: `Festival vacation trip ${runId}`,
    notes: 'Visiting hometown for family reunion',
    emergencyContactPhone: '+919876500001',
    optOutMeals: true,
  };

  const createRes = await request('POST', '/leaves', leavePayload, tokens.RESIDENT);
  assert(createRes.status === 201, 'POST /leaves by RESIDENT -> 201 Created');
  const createdLeave = createRes.data?.data || createRes.data;
  assert(createdLeave?.reason === leavePayload.reason, 'Created leave reason matches');
  assert(createdLeave?.status === 'PENDING', 'Default status is PENDING');
  assert(createdLeave?.residentId === RESIDENT_PROFILE_ID, 'Leave auto-scoped to authenticated resident profile');
  assert(createdLeave?.propertyId === PROPERTY_ID, 'Leave auto-scoped to resident property');
  if (createdLeave?.id) createdLeaveIds.push(createdLeave.id);

  // 7. Get leave details by ID
  const getRes = await request('GET', `/leaves/${createdLeave.id}`, null, tokens.RESIDENT);
  assert(getRes.status === 200, 'GET /leaves/:id by RESIDENT -> 200 OK');
  const fetchedLeave = getRes.data?.data || getRes.data;
  assert(fetchedLeave?.id === createdLeave.id, 'Retrieved leave ID matches');
  assert(fetchedLeave?.properties?.id === PROPERTY_ID, 'Leave includes property details');
  assert(fetchedLeave?.residents?.id === RESIDENT_PROFILE_ID, 'Leave includes resident details');

  // 8. List leaves by admin
  const listRes = await request('GET', '/leaves', null, tokens.OWNER);
  assert(listRes.status === 200, 'GET /leaves by OWNER -> 200 OK');
  const listData = listRes.data?.data || listRes.data;
  assert(Array.isArray(listData?.items), 'Returned list has items array');
  assert(listData?.items?.some((l) => l.id === createdLeave.id), 'Items array contains created leave');
  assert(listData?.meta?.total >= 1, 'Total count is >= 1');

  // 9. Pagination
  const pageRes = await request('GET', '/leaves?page=1&limit=1', null, tokens.OWNER);
  assert(pageRes.status === 200, 'GET /leaves with pagination -> 200 OK');
  const pageData = pageRes.data?.data || pageRes.data;
  assert(pageData?.items?.length <= 1, 'Items count <= limit');
  assert(pageData?.meta?.page === 1, 'meta.page is 1');
  assert(pageData?.meta?.limit === 1, 'meta.limit is 1');
  assert(pageData?.meta?.totalPages >= 1, 'meta.totalPages computed');

  // 10. Filtering by status
  const filterPending = await request('GET', '/leaves?status=PENDING', null, tokens.OWNER);
  assert(filterPending.status === 200, 'Filter by status=PENDING -> 200 OK');
  const pendingItems = (filterPending.data?.data || filterPending.data)?.items;
  assert(pendingItems.every((l) => l.status === 'PENDING'), 'All filtered items have status PENDING');

  // 11. Search keyword
  const searchRes = await request('GET', `/leaves?search=${runId}`, null, tokens.OWNER);
  assert(searchRes.status === 200, 'Filter by search keyword -> 200 OK');
  const searchItems = (searchRes.data?.data || searchRes.data)?.items;
  assert(searchItems.some((l) => l.id === createdLeave.id), 'Search keyword matched created leave');

  // 12. Update pending leave
  const updatePayload = {
    endDate: '2026-11-06',
    notes: 'Extended return date by 1 day',
  };
  const updateRes = await request('PATCH', `/leaves/${createdLeave.id}`, updatePayload, tokens.RESIDENT);
  assert(updateRes.status === 200, 'PATCH /leaves/:id by RESIDENT -> 200 OK');
  const updatedLeave = updateRes.data?.data || updateRes.data;
  assert(updatedLeave?.endDate === updatePayload.endDate, 'Updated end date verified');
  assert(updatedLeave?.notes === updatePayload.notes, 'Updated notes verified');

  // ==========================================
  // SECTION C: VALIDATION
  // ==========================================
  console.log('\n--- SECTION C: VALIDATION ---');
  // 13. Invalid date format
  const badDateRes = await request('POST', '/leaves', {
    startDate: 'not-a-date',
    endDate: '2026-11-10',
    reason: 'Test bad date',
  }, tokens.RESIDENT);
  assert(badDateRes.status === 400, 'Invalid date string -> 400 Bad Request');

  // 14. Start date after end date
  const backwardsDateRes = await request('POST', '/leaves', {
    startDate: '2026-11-20',
    endDate: '2026-11-10',
    reason: 'Backwards dates',
  }, tokens.RESIDENT);
  assert(backwardsDateRes.status === 400, 'Start date after end date -> 400 Bad Request');

  // 15. Overlapping active leave
  const overlapRes = await request('POST', '/leaves', {
    startDate: '2026-11-02',
    endDate: '2026-11-04',
    reason: 'Overlapping request',
  }, tokens.RESIDENT);
  assert(overlapRes.status === 400, 'Overlapping active leave window -> 400 Bad Request');

  // 16. Invalid UUID param
  const badUuidRes = await request('GET', '/leaves/not-a-uuid', null, tokens.OWNER);
  assert(badUuidRes.status === 400, 'Invalid UUID parameter -> 400 Bad Request');

  // 17. Missing required reason
  const missingReasonRes = await request('POST', '/leaves', {
    startDate: '2026-12-01',
    endDate: '2026-12-05',
  }, tokens.RESIDENT);
  assert(missingReasonRes.status === 400, 'Missing required reason -> 400 Bad Request');

  // 18. Non-whitelisted field in payload
  const unknownFieldRes = await request('POST', '/leaves', {
    startDate: '2026-12-01',
    endDate: '2026-12-05',
    reason: 'Valid reason',
    maliciousField: 'payload_injection',
  }, tokens.RESIDENT);
  assert(unknownFieldRes.status === 400, 'Non-whitelisted field in payload -> 400 Bad Request');

  // ==========================================
  // SECTION D: RESIDENT ISOLATION
  // ==========================================
  console.log('\n--- SECTION D: RESIDENT ISOLATION ---');
  // Create a leave on behalf of other resident by Manager
  const otherResidentLeavePayload = {
    residentId: OTHER_RESIDENT_PROFILE_ID,
    propertyId: PROPERTY_ID,
    startDate: '2026-12-10',
    endDate: '2026-12-15',
    reason: `Other Resident Leave ${runId}`,
  };
  const otherCreateRes = await request('POST', '/leaves', otherResidentLeavePayload, tokens.MANAGER);
  assert(otherCreateRes.status === 201, 'Manager creates leave for other resident -> 201 Created');
  const otherLeave = otherCreateRes.data?.data || otherCreateRes.data;
  if (otherLeave?.id) createdLeaveIds.push(otherLeave.id);

  // Resident lists leaves -> must only see own leaves
  const resList = await request('GET', '/leaves', null, tokens.RESIDENT);
  assert(resList.status === 200, 'GET /leaves by RESIDENT -> 200 OK');
  const resListItems = (resList.data?.data || resList.data)?.items;
  assert(resListItems.some((l) => l.id === createdLeave.id), 'Resident list contains own leave');
  assert(!resListItems.some((l) => l.id === otherLeave.id), 'Resident list does NOT contain other resident leave');

  // 19. Resident accessing another resident leave -> 404
  const resGetOther = await request('GET', `/leaves/${otherLeave.id}`, null, tokens.RESIDENT);
  assert(resGetOther.status === 404, 'Resident accessing another resident leave -> 404 Not Found');

  // 20. Resident modifying another resident leave -> 404
  const resPatchOther = await request('PATCH', `/leaves/${otherLeave.id}`, { reason: 'Hacked' }, tokens.RESIDENT);
  assert(resPatchOther.status === 404, 'Resident modifying other resident leave -> 404 Not Found');

  // ==========================================
  // SECTION E: APPROVAL WORKFLOW
  // ==========================================
  console.log('\n--- SECTION E: APPROVAL WORKFLOW ---');
  // 21. Manager approves leave
  const approveRes = await request('POST', `/leaves/${createdLeave.id}/approve`, {}, tokens.MANAGER);
  assert(approveRes.status === 200, 'POST /leaves/:id/approve by MANAGER -> 200 OK');
  const approvedData = approveRes.data?.data || approveRes.data;
  assert(approvedData?.status === 'APPROVED', 'Leave status is updated to APPROVED');
  assert(approvedData?.approvedByUserId === USERS.MANAGER.userId, 'approvedByUserId is recorded');

  // 22. Duplicate approval rejection
  const dupApproveRes = await request('POST', `/leaves/${createdLeave.id}/approve`, {}, tokens.MANAGER);
  assert(dupApproveRes.status === 400, 'Duplicate approval rejected -> 400 Bad Request');

  // 23. Resident attempt to approve
  const resApproveRes = await request('POST', `/leaves/${otherLeave.id}/approve`, {}, tokens.RESIDENT);
  assert(resApproveRes.status === 403, 'Resident attempt to approve -> 403 Forbidden');

  // 24. Invalid transition: cannot approve cancelled leave (tested later)

  // ==========================================
  // SECTION F: REJECTION WORKFLOW
  // ==========================================
  console.log('\n--- SECTION F: REJECTION WORKFLOW ---');
  // 25. Reject other leave with reason
  const rejectPayload = { rejectionReason: 'High priority project submission' };
  const rejectRes = await request('POST', `/leaves/${otherLeave.id}/reject`, rejectPayload, tokens.STAFF);
  assert(rejectRes.status === 200, 'POST /leaves/:id/reject by STAFF -> 200 OK');
  const rejectedData = rejectRes.data?.data || rejectRes.data;
  assert(rejectedData?.status === 'REJECTED', 'Leave status is updated to REJECTED');
  assert(rejectedData?.rejectionReason === rejectPayload.rejectionReason, 'rejectionReason is recorded');

  // 26. Missing rejection reason
  const noReasonReject = await request('POST', `/leaves/${createdLeave.id}/reject`, {}, tokens.MANAGER);
  assert(noReasonReject.status === 400, 'Missing rejectionReason payload -> 400 Bad Request');

  // 27. Duplicate rejection rejection
  const dupRejectRes = await request('POST', `/leaves/${otherLeave.id}/reject`, rejectPayload, tokens.STAFF);
  assert(dupRejectRes.status === 400, 'Duplicate rejection rejected -> 400 Bad Request');

  // 28. Attempt to approve already rejected leave
  const approveRejectedRes = await request('POST', `/leaves/${otherLeave.id}/approve`, {}, tokens.MANAGER);
  assert(approveRejectedRes.status === 400, 'Approving a rejected leave rejected -> 400 Bad Request');

  // 29. Resident attempt to reject
  const resRejectRes = await request('POST', `/leaves/${createdLeave.id}/reject`, rejectPayload, tokens.RESIDENT);
  assert(resRejectRes.status === 403, 'Resident attempt to reject -> 403 Forbidden');

  // ==========================================
  // SECTION G: CANCELLATION WORKFLOW
  // ==========================================
  console.log('\n--- SECTION G: CANCELLATION WORKFLOW ---');
  // Create a new pending leave for cancellation test
  const cancelLeavePayload = {
    startDate: '2026-12-20',
    endDate: '2026-12-25',
    reason: `Cancellation Test Leave ${runId}`,
  };
  const cancelCreateRes = await request('POST', '/leaves', cancelLeavePayload, tokens.RESIDENT);
  const cancelLeave = cancelCreateRes.data?.data || cancelCreateRes.data;
  if (cancelLeave?.id) createdLeaveIds.push(cancelLeave.id);

  // 30. Resident cancels own pending leave
  const cancelRes = await request('POST', `/leaves/${cancelLeave.id}/cancel`, {}, tokens.RESIDENT);
  assert(cancelRes.status === 200, 'POST /leaves/:id/cancel by RESIDENT -> 200 OK');
  const cancelledData = cancelRes.data?.data || cancelRes.data;
  assert(cancelledData?.status === 'CANCELLED', 'Leave status is updated to CANCELLED');

  // 31. Duplicate cancellation
  const dupCancelRes = await request('POST', `/leaves/${cancelLeave.id}/cancel`, {}, tokens.RESIDENT);
  assert(dupCancelRes.status === 400, 'Duplicate cancellation rejected -> 400 Bad Request');

  // 32. Attempt to cancel already approved leave
  const cancelApprovedRes = await request('POST', `/leaves/${createdLeave.id}/cancel`, {}, tokens.RESIDENT);
  assert(cancelApprovedRes.status === 400, 'Resident cancelling approved leave rejected -> 400 Bad Request');

  // 33. Attempt to approve a cancelled leave
  const approveCancelledRes = await request('POST', `/leaves/${cancelLeave.id}/approve`, {}, tokens.MANAGER);
  assert(approveCancelledRes.status === 400, 'Approving cancelled leave rejected -> 400 Bad Request');

  // ==========================================
  // SECTION H: RBAC ACROSS ALL FIVE ROLES
  // ==========================================
  console.log('\n--- SECTION H: RBAC ACROSS ALL FIVE ROLES ---');
  // 34. OWNER can list leaves
  const ownerList = await request('GET', '/leaves', null, tokens.OWNER);
  assert(ownerList.status === 200, 'OWNER has leave listing permission (200 OK)');

  // 35. MANAGER can list leaves
  const mgrList = await request('GET', '/leaves', null, tokens.MANAGER);
  assert(mgrList.status === 200, 'MANAGER has leave listing permission (200 OK)');

  // 36. STAFF can list leaves
  const staffList = await request('GET', '/leaves', null, tokens.STAFF);
  assert(staffList.status === 200, 'STAFF has leave listing permission (200 OK)');

  // 37. ACCOUNTANT denied list
  const accList = await request('GET', '/leaves', null, tokens.ACCOUNTANT);
  assert(accList.status === 403, 'ACCOUNTANT listing leaves -> 403 Forbidden');

  // 38. ACCOUNTANT denied create
  const accCreate = await request('POST', '/leaves', leavePayload, tokens.ACCOUNTANT);
  assert(accCreate.status === 403, 'ACCOUNTANT creating leave -> 403 Forbidden');

  // 39. ACCOUNTANT denied approve
  const accApprove = await request('POST', `/leaves/${createdLeave.id}/approve`, {}, tokens.ACCOUNTANT);
  assert(accApprove.status === 403, 'ACCOUNTANT approving leave -> 403 Forbidden');

  // 40. ACCOUNTANT denied reject
  const accReject = await request('POST', `/leaves/${createdLeave.id}/reject`, rejectPayload, tokens.ACCOUNTANT);
  assert(accReject.status === 403, 'ACCOUNTANT rejecting leave -> 403 Forbidden');

  // 41. ACCOUNTANT denied cancel
  const accCancel = await request('POST', `/leaves/${createdLeave.id}/cancel`, {}, tokens.ACCOUNTANT);
  assert(accCancel.status === 403, 'ACCOUNTANT cancelling leave -> 403 Forbidden');

  // ==========================================
  // SECTION I: ORGANIZATION ISOLATION
  // ==========================================
  console.log('\n--- SECTION I: ORGANIZATION ISOLATION ---');
  // 42. Missing X-Organization-Id header
  const noOrgHeader = await request('GET', '/leaves', null, tokens.OWNER, null);
  assert(noOrgHeader.status === 400, 'Missing X-Organization-Id header -> 400 Bad Request');

  // 43. Invalid organization UUID format
  const badOrgUuid = await request('GET', '/leaves', null, tokens.OWNER, 'not-a-valid-uuid');
  assert(badOrgUuid.status === 400, 'Invalid organization UUID header -> 400 Bad Request');

  // 44. Non-member organization header
  const foreignOrgRes = await request('GET', '/leaves', null, tokens.OWNER, CROSS_ORG_ID);
  assert(foreignOrgRes.status === 403, 'Non-member organization header -> 403 Forbidden');

  // 45. Cross-organization leave ID retrieval
  const crossOrgLeaveRes = await request('GET', `/leaves/${CROSS_ORG_ID}`, null, tokens.OWNER);
  assert(crossOrgLeaveRes.status === 404, 'Cross-org / non-existent leave -> 404 Not Found');

  // ==========================================
  // SECTION J: PROPERTY ISOLATION
  // ==========================================
  console.log('\n--- SECTION J: PROPERTY ISOLATION ---');
  // 46. Admin creating leave with cross-org property
  const badPropLeave = await request('POST', '/leaves', {
    residentId: OTHER_RESIDENT_PROFILE_ID,
    propertyId: CROSS_ORG_ID,
    startDate: '2026-11-15',
    endDate: '2026-11-18',
    reason: 'Cross property attack',
  }, tokens.MANAGER);
  assert(badPropLeave.status === 404, 'Leave with foreign property -> 404 Not Found');

  // ==========================================
  // SECTION K: AUDIT LOGGING
  // ==========================================
  console.log('\n--- SECTION K: AUDIT LOGGING ---');
  const auditLogs = await prisma.audit_logs.findMany({
    where: {
      organizationId: ORG_ID,
      entityType: 'leaves',
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const actions = auditLogs.map((l) => l.action);
  console.log('  Audit log actions recorded for leaves:', Array.from(new Set(actions)));
  // 47. leave.created
  assert(actions.includes('leave.created'), 'Audit log contains leave.created');
  // 48. leave.updated
  assert(actions.includes('leave.updated'), 'Audit log contains leave.updated');
  // 49. leave.approved
  assert(actions.includes('leave.approved'), 'Audit log contains leave.approved');
  // 50. leave.rejected
  assert(actions.includes('leave.rejected'), 'Audit log contains leave.rejected');
  // 51. leave.cancelled
  assert(actions.includes('leave.cancelled'), 'Audit log contains leave.cancelled');

  // ==========================================
  // SECTION L: DATA INTEGRITY
  // ==========================================
  console.log('\n--- SECTION L: DATA INTEGRITY ---');
  // 52. Valid resident association
  const resRecord = await prisma.residents.findUnique({ where: { id: createdLeave.residentId } });
  assert(!!resRecord && resRecord.organizationId === ORG_ID, 'Leave resident belongs to current organization');

  // 53. Valid property association
  const propRecord = await prisma.properties.findUnique({ where: { id: createdLeave.propertyId } });
  assert(!!propRecord && propRecord.organizationId === ORG_ID, 'Leave property belongs to current organization');

  // 54. Non-existent resident creation rejected
  const fakeResidentLeave = await request('POST', '/leaves', {
    residentId: CROSS_ORG_ID,
    propertyId: PROPERTY_ID,
    startDate: '2026-11-20',
    endDate: '2026-11-25',
    reason: 'Fake resident test',
  }, tokens.MANAGER);
  assert(fakeResidentLeave.status === 404, 'Invalid resident reference rejected -> 404 Not Found');

  // ==========================================
  // SECTION M: CONCURRENCY
  // ==========================================
  console.log('\n--- SECTION M: CONCURRENCY ---');
  // Create fresh leave for concurrency test
  const concLeavePayload = {
    residentId: OTHER_RESIDENT_PROFILE_ID,
    propertyId: PROPERTY_ID,
    startDate: '2026-12-26',
    endDate: '2026-12-30',
    reason: `Concurrency Test Leave ${runId}`,
  };
  const concCreate = await request('POST', '/leaves', concLeavePayload, tokens.MANAGER);
  const concLeave = concCreate.data?.data || concCreate.data;
  if (concLeave?.id) createdLeaveIds.push(concLeave.id);

  // 55. Concurrent approval
  const [ap1, ap2] = await Promise.all([
    request('POST', `/leaves/${concLeave.id}/approve`, {}, tokens.OWNER),
    request('POST', `/leaves/${concLeave.id}/approve`, {}, tokens.MANAGER),
  ]);
  const apSuccessCount = (ap1.status === 200 ? 1 : 0) + (ap2.status === 200 ? 1 : 0);
  const apFailCount = (ap1.status === 400 ? 1 : 0) + (ap2.status === 400 ? 1 : 0);
  assert(
    apSuccessCount === 1 && apFailCount === 1,
    'Concurrent approval handled: exactly 1 succeeds (200), 1 rejected (400)',
  );

  // Create another fresh leave for concurrent rejection/approval race
  const concLeave2Payload = {
    residentId: OTHER_RESIDENT_PROFILE_ID,
    propertyId: PROPERTY_ID,
    startDate: '2027-01-01',
    endDate: '2027-01-05',
    reason: `Concurrency Conflict Leave ${runId}`,
  };
  const concCreate2 = await request('POST', '/leaves', concLeave2Payload, tokens.MANAGER);
  const concLeave2 = concCreate2.data?.data || concCreate2.data;
  if (concLeave2?.id) createdLeaveIds.push(concLeave2.id);

  // 56. Concurrent approval vs rejection
  const [cApprove, cReject] = await Promise.all([
    request('POST', `/leaves/${concLeave2.id}/approve`, {}, tokens.OWNER),
    request('POST', `/leaves/${concLeave2.id}/reject`, { rejectionReason: 'Race condition test' }, tokens.MANAGER),
  ]);
  const confSuccessCount = (cApprove.status === 200 ? 1 : 0) + (cReject.status === 200 ? 1 : 0);
  const confFailCount = (cApprove.status === 400 ? 1 : 0) + (cReject.status === 400 ? 1 : 0);
  assert(
    confSuccessCount === 1 && confFailCount === 1,
    'Conflicting approval vs rejection: exactly 1 succeeds (200), 1 rejected (400)',
  );

  // ==========================================
  // CLEANUP TEST ARTIFACTS
  // ==========================================
  console.log('\n--- CLEANUP TEST ARTIFACTS ---');
  if (createdLeaveIds.length > 0) {
    await prisma.audit_logs.deleteMany({
      where: {
        organizationId: ORG_ID,
        entityType: 'leaves',
        entityId: { in: createdLeaveIds },
      },
    });
    console.log(`  Cleaned up audit logs for ${createdLeaveIds.length} test leaves`);
  }

  console.log('\n==========================================');
  console.log('PHASE 14 TEST RESULTS');
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
