
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
env.split('\n').forEach(line => {
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
const ROOM_ID = '42cf26be-cce4-4b93-9a34-c9f46cbb88ec';
const BED_ID = 'cfca1ef5-d82f-4d8e-bc36-d2b6c9398e5b';

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
  console.log('=== STARTING PHASE 10 COMPREHENSIVE TEST SUITE ===\n');

  // Step 1: Verification of Authentication Tokens
  console.log('--- STEP 1: AUTHENTICATION VERIFICATION ---');
  for (const role of Object.keys(tokens)) {
    assert(!!tokens[role], `${role} token signed`);
  }

  // Load profiles
  const resProfile = await prisma.residents.findFirst({
    where: { organizationId: ORG_ID, email: USERS.RESIDENT.email },
  });
  const residentProfileId = resProfile.id;

  const stProfile = await prisma.staff_profiles.findFirst({
    where: { organizationId: ORG_ID, email: USERS.STAFF.email },
  });
  const staffProfileId = stProfile.id;
  const staffUserId = stProfile.userId;

  // Track created entity IDs for cleanup
  const createdComplaints = [];
  const createdMaintenance = [];
  const createdStaffTasks = [];

  // ==========================================
  // SECTION 1: COMPLAINTS MODULE TESTS
  // ==========================================
  console.log('\n--- SECTION 1: COMPLAINTS TESTS ---');

  // 1.1 Create complaint by Owner
  const c1Res = await request('POST', '/complaints', {
    propertyId: PROPERTY_ID,
    residentId: residentProfileId,
    subject: 'Air conditioning dripping water',
    description: 'AC unit in Room 101 has water condensation leaking onto floor.',
    category: 'HYGIENE_CLEANLINESS',
    priority: 'HIGH',
    notes: 'Initial ticket from front desk',
  }, tokens.OWNER);

  assert(c1Res.status === 201, 'Owner creates complaint -> 201');
  assert(c1Res.data?.data?.ticketNumber?.startsWith('CMP-'), 'Ticket number generated with prefix CMP-');
  const complaint1Id = c1Res.data?.data?.id;
  createdComplaints.push(complaint1Id);

  // 1.2 Create complaint by Resident (self-service)
  const cResSelf = await request('POST', '/complaints', {
    propertyId: PROPERTY_ID,
    subject: 'Wi-Fi router disconnected',
    description: 'No internet connection in my room since morning.',
    category: 'OTHER',
    priority: 'MEDIUM',
  }, tokens.RESIDENT);

  assert(cResSelf.status === 201, 'Resident creates complaint -> 201');
  assert(cResSelf.data?.data?.residentId === residentProfileId, 'Resident complaint auto-scoped to resident ID');
  const complaintResId = cResSelf.data?.data?.id;
  createdComplaints.push(complaintResId);

  // 1.3 List complaints as Owner
  const cListOwner = await request('GET', '/complaints?page=1&limit=10', null, tokens.OWNER);
  assert(cListOwner.status === 200, 'Owner lists complaints -> 200');
  assert(Array.isArray(cListOwner.data?.data?.items), 'Complaints returned as items array');
  assert(cListOwner.data?.data?.meta?.total >= 2, 'Total complaints count accurate');

  // 1.4 List complaints as Resident (should ONLY see own)
  const cListRes = await request('GET', '/complaints', null, tokens.RESIDENT);
  assert(cListRes.status === 200, 'Resident lists complaints -> 200');
  const allResComplaintsBelongToSelf = cListRes.data?.data?.items?.every(
    item => item.residentId === residentProfileId
  );
  assert(allResComplaintsBelongToSelf, 'Resident only sees own complaints in list');

  // 1.5 Get single complaint as Owner
  const cGetOwner = await request('GET', `/complaints/${complaint1Id}`, null, tokens.OWNER);
  assert(cGetOwner.status === 200, 'Owner gets complaint details -> 200');
  assert(cGetOwner.data?.data?.subject === 'Air conditioning dripping water', 'Complaint details match');

  // 1.5.1 Create a complaint for ANOTHER resident
  const cOtherRes = await request('POST', '/complaints', {
    propertyId: PROPERTY_ID,
    residentId: '00499de1-5cf5-4051-b57c-ec705938746f',
    subject: 'Another resident complaint',
    description: 'Complaint belonging to Rohan Gupta',
  }, tokens.OWNER);
  const otherComplaintId = cOtherRes.data?.data?.id;
  if (otherComplaintId) createdComplaints.push(otherComplaintId);

  // 1.6 Resident cannot access another resident's complaint
  const cGetResForbidden = await request('GET', `/complaints/${otherComplaintId}`, null, tokens.RESIDENT);
  assert(cGetResForbidden.status === 404, 'Resident accessing another complaint -> 404 Not Found');

  // 1.7 Resident CAN access their own complaint
  const cGetResOwn = await request('GET', `/complaints/${complaintResId}`, null, tokens.RESIDENT);
  assert(cGetResOwn.status === 200, 'Resident accesses own complaint -> 200');

  // 1.8 Update complaint (assign staff & change status to INVESTIGATING)
  const cPatchRes = await request('PATCH', `/complaints/${complaint1Id}`, {
    status: 'INVESTIGATING',
    assignedToId: staffUserId,
    investigationNotes: 'Technician inspected AC compressor and drain pipe.',
    notes: 'Assigned to staff and status changed to INVESTIGATING',
  }, tokens.MANAGER);

  assert(cPatchRes.status === 200, 'Manager updates complaint & assigns staff -> 200');
  assert(cPatchRes.data?.data?.status === 'INVESTIGATING', 'Complaint status updated to INVESTIGATING');
  assert(cPatchRes.data?.data?.assignedToId === staffUserId, 'Complaint assigned to staff');

  // 1.9 Resolve complaint
  const cResolveRes = await request('PATCH', `/complaints/${complaint1Id}`, {
    status: 'RESOLVED',
    resolutionNotes: 'Cleared blockage from AC drainage pipe. Tested for 20 mins without leak.',
    notes: 'Marked as resolved',
  }, tokens.STAFF);

  assert(cResolveRes.status === 200, 'Staff resolves complaint -> 200');
  assert(cResolveRes.data?.data?.status === 'RESOLVED', 'Complaint status is RESOLVED');
  assert(!!cResolveRes.data?.data?.resolvedAt, 'resolvedAt timestamp set automatically');

  // 1.10 Close complaint
  const cCloseRes = await request('PATCH', `/complaints/${complaint1Id}`, {
    status: 'CLOSED',
    notes: 'Resident confirmed resolution. Ticket closed.',
  }, tokens.OWNER);

  assert(cCloseRes.status === 200, 'Owner closes complaint -> 200');
  assert(cCloseRes.data?.data?.status === 'CLOSED', 'Complaint status is CLOSED');
  assert(!!cCloseRes.data?.data?.closedAt, 'closedAt timestamp set automatically');

  // 1.11 Verify Complaint History
  const cHistoryRes = await request('GET', `/complaints/${complaint1Id}/history`, null, tokens.OWNER);
  assert(cHistoryRes.status === 200, 'Get complaint history -> 200');
  assert(Array.isArray(cHistoryRes.data?.data), 'Complaint history is array');
  assert(cHistoryRes.data?.data?.length >= 4, `Complaint history recorded 4 transitions (got ${cHistoryRes.data?.data?.length})`);

  // ==========================================
  // SECTION 2: MAINTENANCE MODULE TESTS
  // ==========================================
  console.log('\n--- SECTION 2: MAINTENANCE TESTS ---');

  // 2.1 Create maintenance request by Owner
  const m1Res = await request('POST', '/maintenance', {
    propertyId: PROPERTY_ID,
    roomId: ROOM_ID,
    bedId: BED_ID,
    title: 'Replace burnt switch board',
    description: 'Switch socket spark noted near Bed 101-A.',
    category: 'ELECTRICAL',
    priority: 'EMERGENCY',
    estimatedCost: 350.0,
    notes: 'Reported during room inspection',
  }, tokens.OWNER);

  assert(m1Res.status === 201, 'Owner creates maintenance request -> 201');
  assert(m1Res.data?.data?.ticketNumber?.startsWith('MNT-'), 'Ticket number generated with prefix MNT-');
  const maint1Id = m1Res.data?.data?.id;
  createdMaintenance.push(maint1Id);

  // 2.2 Create maintenance request by Resident
  const mResSelf = await request('POST', '/maintenance', {
    propertyId: PROPERTY_ID,
    title: 'Bathroom door latch jammed',
    description: 'Unable to lock door from inside.',
    category: 'FURNITURE',
    priority: 'MEDIUM',
  }, tokens.RESIDENT);

  assert(mResSelf.status === 201, 'Resident creates maintenance request -> 201');
  assert(mResSelf.data?.data?.residentId === residentProfileId, 'Maintenance request auto-linked to resident');
  const maintResId = mResSelf.data?.data?.id;
  createdMaintenance.push(maintResId);

  // 2.3 List maintenance requests as Owner
  const mListOwner = await request('GET', '/maintenance?page=1&limit=10', null, tokens.OWNER);
  assert(mListOwner.status === 200, 'Owner lists maintenance requests -> 200');
  assert(mListOwner.data?.data?.meta?.total >= 2, 'Total maintenance requests accurate');

  // 2.4 List maintenance requests as Resident
  const mListRes = await request('GET', '/maintenance', null, tokens.RESIDENT);
  assert(mListRes.status === 200, 'Resident lists maintenance -> 200');
  const allResMaintBelongToSelf = mListRes.data?.data?.items?.every(
    item => item.residentId === residentProfileId
  );
  assert(allResMaintBelongToSelf, 'Resident only sees own maintenance requests');

  // 2.5 Resident cannot access another resident's maintenance request
  const mGetOtherRes = await request('GET', `/maintenance/${maint1Id}`, null, tokens.RESIDENT);
  assert(mGetOtherRes.status === 404, 'Resident accessing another maintenance request -> 404');

  // 2.6 Assign maintenance request (Manager assigns staff & vendor)
  const mAssignRes = await request('PATCH', `/maintenance/${maint1Id}`, {
    status: 'ASSIGNED',
    assignedStaffId: staffUserId,
    vendorName: 'Bangalore Spark Electricians',
    notes: 'Work assigned to electrical vendor and staff coordinator',
  }, tokens.MANAGER);

  assert(mAssignRes.status === 200, 'Manager assigns maintenance -> 200');
  assert(mAssignRes.data?.data?.status === 'ASSIGNED', 'Status updated to ASSIGNED');
  assert(!!mAssignRes.data?.data?.assignedAt, 'assignedAt timestamp recorded');

  // 2.7 Staff advances maintenance to IN_PROGRESS
  const mProgressRes = await request('PATCH', `/maintenance/${maint1Id}`, {
    status: 'IN_PROGRESS',
    notes: 'Electrician on site, work started',
  }, tokens.STAFF);

  assert(mProgressRes.status === 200, 'Staff starts work -> 200');
  assert(mProgressRes.data?.data?.status === 'IN_PROGRESS', 'Status updated to IN_PROGRESS');
  assert(!!mProgressRes.data?.data?.startedAt, 'startedAt timestamp recorded');

  // 2.8 Complete maintenance request
  const mCompleteRes = await request('PATCH', `/maintenance/${maint1Id}`, {
    status: 'COMPLETED',
    actualCost: 400.0,
    resolutionNotes: 'Replaced complete modular switch board and tested earthing.',
    notes: 'Work completed successfully',
  }, tokens.STAFF);

  assert(mCompleteRes.status === 200, 'Staff completes maintenance -> 200');
  assert(mCompleteRes.data?.data?.status === 'COMPLETED', 'Status updated to COMPLETED');
  assert(!!mCompleteRes.data?.data?.completedAt, 'completedAt timestamp recorded');

  // 2.9 Verify maintenance history
  const mHistoryRes = await request('GET', `/maintenance/${maint1Id}/history`, null, tokens.OWNER);
  assert(mHistoryRes.status === 200, 'Get maintenance history -> 200');
  assert(mHistoryRes.data?.data?.length >= 4, `Maintenance history recorded 4 transitions (got ${mHistoryRes.data?.data?.length})`);

  // ==========================================
  // SECTION 3: STAFF TASKS MODULE TESTS
  // ==========================================
  console.log('\n--- SECTION 3: STAFF TASKS TESTS ---');

  // 3.1 Create staff task by Owner
  const st1Res = await request('POST', '/staff-tasks', {
    propertyId: PROPERTY_ID,
    roomId: ROOM_ID,
    location: 'Room 101 Bathroom',
    title: 'Weekly deep cleaning and sanitization',
    description: 'Clean floor tiles, mirror, and replenish toilet supplies.',
    category: 'BATHROOM_CLEANING',
    priority: 'MEDIUM',
    dueDate: '2026-10-10',
    dueTime: '11:00',
    notes: 'Routine scheduled housekeeping',
  }, tokens.OWNER);

  assert(st1Res.status === 201, 'Owner creates staff task -> 201');
  const taskId1 = st1Res.data?.data?.id;
  createdStaffTasks.push(taskId1);

  // 3.2 Create staff task assigned to staff profile by Manager
  const st2Res = await request('POST', '/staff-tasks', {
    propertyId: PROPERTY_ID,
    location: '1st Floor Common Corridor',
    title: 'Mop floor and empty garbage bins',
    category: 'COMMON_AREA',
    priority: 'HIGH',
    dueDate: '2026-10-06',
    dueTime: '09:00',
    assignedStaffId: staffProfileId,
    notes: 'Morning shift task',
  }, tokens.MANAGER);

  assert(st2Res.status === 201, 'Manager creates assigned staff task -> 201');
  assert(st2Res.data?.data?.assignedStaffId === staffProfileId, 'Staff profile assigned to task');
  const taskId2 = st2Res.data?.data?.id;
  createdStaffTasks.push(taskId2);

  // 3.3 Resident is FORBIDDEN from staff tasks
  const stResForbidden = await request('GET', '/staff-tasks', null, tokens.RESIDENT);
  assert(stResForbidden.status === 403, 'Resident cannot list staff tasks -> 403 Forbidden');

  const stResCreateForbidden = await request('POST', '/staff-tasks', {
    propertyId: PROPERTY_ID,
    location: 'Room 101',
    title: 'Clean room',
    dueDate: '2026-10-06',
  }, tokens.RESIDENT);
  assert(stResCreateForbidden.status === 403, 'Resident cannot create staff task -> 403 Forbidden');

  // 3.4 List staff tasks as Owner
  const stListOwner = await request('GET', '/staff-tasks?page=1&limit=10', null, tokens.OWNER);
  assert(stListOwner.status === 200, 'Owner lists staff tasks -> 200');
  assert(stListOwner.data?.data?.meta?.total >= 2, 'Total staff tasks accurate');

  // 3.5 Staff lists tasks
  const stListStaff = await request('GET', '/staff-tasks', null, tokens.STAFF);
  assert(stListStaff.status === 200, 'Staff lists tasks -> 200');

  // 3.6 Staff updates task status to IN_PROGRESS
  const stProgress = await request('PATCH', `/staff-tasks/${taskId1}`, {
    status: 'IN_PROGRESS',
    notes: 'Housekeeper started deep cleaning',
  }, tokens.STAFF);

  assert(stProgress.status === 200, 'Staff updates task status to IN_PROGRESS -> 200');

  // 3.7 Staff completes task
  const stComplete = await request('PATCH', `/staff-tasks/${taskId1}`, {
    status: 'COMPLETED',
    notes: 'Housekeeping completed, inspection passed',
  }, tokens.STAFF);

  assert(stComplete.status === 200, 'Staff completes task -> 200');
  assert(stComplete.data?.data?.status === 'COMPLETED', 'Status is COMPLETED');
  assert(!!stComplete.data?.data?.completionTime, 'completionTime recorded');

  // 3.8 Staff CANNOT reassign tasks (requires maintenance.assign)
  const stReassignStaff = await request('PATCH', `/staff-tasks/${taskId1}`, {
    assignedStaffId: staffProfileId,
  }, tokens.STAFF);
  assert(stReassignStaff.status === 403, 'Staff cannot reassign task -> 403 Forbidden (no maintenance.assign)');

  // 3.9 Verify staff task history
  const stHistoryRes = await request('GET', `/staff-tasks/${taskId1}/history`, null, tokens.OWNER);
  assert(stHistoryRes.status === 200, 'Get staff task history -> 200');
  assert(stHistoryRes.data?.data?.length >= 3, `Staff task history recorded 3 transitions (got ${stHistoryRes.data?.data?.length})`);

  // ==========================================
  // SECTION 4: SECURITY & RBAC ISOLATION TESTS
  // ==========================================
  console.log('\n--- SECTION 4: SECURITY & RBAC ISOLATION ---');

  // 4.1 Missing JWT -> 401
  const noJwtRes = await request('GET', '/complaints');
  assert(noJwtRes.status === 401, 'Missing JWT -> 401 Unauthorized');

  // 4.2 Missing Organization Header -> 400
  const noOrgRes = await request('GET', '/complaints', null, tokens.OWNER, null);
  assert(noOrgRes.status === 400, 'Missing X-Organization-Id header -> 400 Bad Request');

  // 4.3 Invalid Organization Header format -> 400
  const invalidOrgRes = await request('GET', '/complaints', null, tokens.OWNER, 'not-a-uuid');
  assert(invalidOrgRes.status === 400, 'Invalid X-Organization-Id format -> 400 Bad Request');

  // 4.4 Inactive/Non-member Organization -> 403
  const foreignOrgRes = await request('GET', '/complaints', null, tokens.OWNER, CROSS_ORG_ID);
  assert(foreignOrgRes.status === 403, 'Non-member organization -> 403 Forbidden');

  // 4.5 Cross-organization resource access -> 404 (isolation)
  const nonExistentComplaint = await request('GET', `/complaints/${CROSS_ORG_ID}`, null, tokens.OWNER);
  assert(nonExistentComplaint.status === 404, 'Non-existent / cross-org complaint -> 404 Not Found');

  // 4.6 Accountant (has no maintenance.* permissions) -> 403 on all operations
  const accCompList = await request('GET', '/complaints', null, tokens.ACCOUNTANT);
  assert(accCompList.status === 403, 'Accountant cannot list complaints -> 403 Forbidden');

  const accMaintList = await request('GET', '/maintenance', null, tokens.ACCOUNTANT);
  assert(accMaintList.status === 403, 'Accountant cannot list maintenance -> 403 Forbidden');

  const accTaskList = await request('GET', '/staff-tasks', null, tokens.ACCOUNTANT);
  assert(accTaskList.status === 403, 'Accountant cannot list staff tasks -> 403 Forbidden');

  const accCompCreate = await request('POST', '/complaints', {
    propertyId: PROPERTY_ID,
    residentId: residentProfileId,
    subject: 'Test',
    description: 'Test',
  }, tokens.ACCOUNTANT);
  assert(accCompCreate.status === 403, 'Accountant cannot create complaint -> 403 Forbidden');

  // 4.7 Validation Pipe errors -> 400
  const invalidUuidParam = await request('GET', '/complaints/not-a-uuid', null, tokens.OWNER);
  assert(invalidUuidParam.status === 400, 'Invalid UUID parameter -> 400 Bad Request');

  const invalidEnumBody = await request('POST', '/complaints', {
    propertyId: PROPERTY_ID,
    residentId: residentProfileId,
    subject: 'Bad enum',
    description: 'Testing',
    category: 'INVALID_CATEGORY_NAME',
  }, tokens.OWNER);
  assert(invalidEnumBody.status === 400, 'Invalid enum in body -> 400 Bad Request');

  const missingSubjectBody = await request('POST', '/complaints', {
    propertyId: PROPERTY_ID,
    residentId: residentProfileId,
    description: 'Testing missing subject',
  }, tokens.OWNER);
  assert(missingSubjectBody.status === 400, 'Missing required subject -> 400 Bad Request');

  // ==========================================
  // SECTION 5: AUDIT LOGS & DATA INTEGRITY
  // ==========================================
  console.log('\n--- SECTION 5: AUDIT LOGS & DATA INTEGRITY ---');

  const auditLogs = await prisma.audit_logs.findMany({
    where: {
      organizationId: ORG_ID,
      entityType: { in: ['complaints', 'maintenance_requests', 'staff_tasks'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const actionsRecorded = new Set(auditLogs.map(l => l.action));
  console.log('  Audit log actions recorded:', [...actionsRecorded]);

  assert(actionsRecorded.has('complaint.created'), 'Audit log contains complaint.created');
  assert(actionsRecorded.has('complaint.status_changed'), 'Audit log contains complaint.status_changed');
  assert(actionsRecorded.has('complaint.assigned'), 'Audit log contains complaint.assigned');
  assert(actionsRecorded.has('maintenance.created'), 'Audit log contains maintenance.created');
  assert(actionsRecorded.has('maintenance.assigned'), 'Audit log contains maintenance.assigned');
  assert(actionsRecorded.has('maintenance.status_changed'), 'Audit log contains maintenance.status_changed');
  assert(actionsRecorded.has('maintenance.completed'), 'Audit log contains maintenance.completed');
  assert(actionsRecorded.has('staff_task.created'), 'Audit log contains staff_task.created');
  assert(actionsRecorded.has('staff_task.assigned'), 'Audit log contains staff_task.assigned');
  assert(actionsRecorded.has('staff_task.status_changed'), 'Audit log contains staff_task.status_changed');
  assert(actionsRecorded.has('staff_task.completed'), 'Audit log contains staff_task.completed');

  // Verify no orphaned history records
  const orphanComplaints = await prisma.$queryRawUnsafe(
    'SELECT ch.id FROM complaint_history ch LEFT JOIN complaints c ON ch."complaintId" = c.id WHERE c.id IS NULL'
  );
  assert(orphanComplaints.length === 0, 'No orphan complaint_history records');

  const orphanMaintenance = await prisma.$queryRawUnsafe(
    'SELECT mh.id FROM maintenance_history mh LEFT JOIN maintenance_requests m ON mh."maintenanceRequestId" = m.id WHERE m.id IS NULL'
  );
  assert(orphanMaintenance.length === 0, 'No orphan maintenance_history records');

  const orphanTasks = await prisma.$queryRawUnsafe(
    'SELECT sth.id FROM staff_task_history sth LEFT JOIN staff_tasks st ON sth."staffTaskId" = st.id WHERE st.id IS NULL'
  );
  assert(orphanTasks.length === 0, 'No orphan staff_task_history records');

  // ==========================================
  // SECTION 6: CONCURRENCY TEST
  // ==========================================
  console.log('\n--- SECTION 6: CONCURRENCY TEST ---');

  // Concurrent updates to same maintenance ticket
  const [cRes1, cRes2] = await Promise.all([
    request('PATCH', `/maintenance/${maintResId}`, {
      status: 'IN_PROGRESS',
      notes: 'Concurrent update 1',
    }, tokens.STAFF),
    request('PATCH', `/maintenance/${maintResId}`, {
      status: 'IN_PROGRESS',
      notes: 'Concurrent update 2',
    }, tokens.MANAGER),
  ]);

  assert(cRes1.status === 200 || cRes2.status === 200, 'Concurrent updates handled gracefully');

  // ==========================================
  // SECTION 7: CLEANUP OF TEST ARTIFACTS
  // ==========================================
  console.log('\n--- SECTION 7: CLEANUP TEST ARTIFACTS ---');

  for (const id of createdStaffTasks) {
    await prisma.staff_task_history.deleteMany({ where: { staffTaskId: id } });
    await prisma.staff_tasks.deleteMany({ where: { id } });
  }
  for (const id of createdMaintenance) {
    await prisma.maintenance_history.deleteMany({ where: { maintenanceRequestId: id } });
    await prisma.maintenance_requests.deleteMany({ where: { id } });
  }
  for (const id of createdComplaints) {
    await prisma.complaint_history.deleteMany({ where: { complaintId: id } });
    await prisma.complaints.deleteMany({ where: { id } });
  }
  console.log('  Cleaned up test complaints, maintenance, and staff tasks.');

  // Clean up test audit logs strictly scoped to created test entity IDs
  const allCreatedP10Ids = [...createdStaffTasks, ...createdMaintenance, ...createdComplaints];
  if (allCreatedP10Ids.length > 0) {
    await prisma.audit_logs.deleteMany({
      where: {
        organizationId: ORG_ID,
        entityId: { in: allCreatedP10Ids },
      },
    });
    console.log('  Cleaned up audit logs scoped to test fixture IDs.');
  }

  console.log(`\n==========================================`);
  console.log(`TOTAL TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`==========================================`);

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error during test suite:', err);
  process.exit(1);
});
