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
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${message}`);
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
  console.log('=== STARTING PHASE 15 COMPREHENSIVE TEST SUITE ===\n');

  const runId = Date.now().toString().slice(-6);
  const createdStaffIds = [];
  const createdAttendanceIds = [];

  // ==========================================
  // SECTION A: AUTHENTICATION
  // ==========================================
  console.log('--- SECTION A: AUTHENTICATION ---');
  for (const role of Object.keys(tokens)) {
    assert(!!tokens[role], `JWT token generated for role ${role}`);
  }
  const healthRes = await request('GET', '/health');
  assert(healthRes.status === 200 && healthRes.data?.database === 'connected', 'System health check -> 200 OK & DB connected');

  // ==========================================
  // SECTION B: STAFF CRUD
  // ==========================================
  console.log('\n--- SECTION B: STAFF CRUD ---');

  // B1: Create staff profile by OWNER
  const staff1Payload = {
    fullName: `Ramesh Kumar ${runId}`,
    role: 'HEAD_WARDEN',
    phone: `+919876${runId}`,
    email: `ramesh.${runId}@blrstays.com`,
    shift: 'MORNING',
    salary: 22000,
    emergencyContactName: 'Suresh Kumar',
    emergencyContactPhone: '+919876543211',
  };
  const staff1Res = await request('POST', '/staff', staff1Payload, tokens.OWNER);
  assert(staff1Res.status === 201, 'Owner creates staff profile -> 201 Created');
  const staff1 = staff1Res.data?.data;
  const staff1Id = staff1?.id;
  if (staff1Id) createdStaffIds.push(staff1Id);
  assert(staff1?.fullName === staff1Payload.fullName && staff1?.status === 'ACTIVE', 'Staff profile fields and default ACTIVE status verified');

  // B2: Create staff profile with propertyId by MANAGER
  const staff2Payload = {
    fullName: `Sunil Guard ${runId}`,
    role: 'SECURITY',
    phone: `+919877${runId}`,
    propertyId: PROPERTY_ID,
    shift: 'NIGHT',
    salary: 16000,
  };
  const staff2Res = await request('POST', '/staff', staff2Payload, tokens.MANAGER);
  assert(staff2Res.status === 201, 'Manager creates staff with propertyId & shift -> 201 Created');
  const staff2Id = staff2Res.data?.data?.id;
  if (staff2Id) createdStaffIds.push(staff2Id);
  assert(staff2Res.data?.data?.propertyId === PROPERTY_ID, 'Property ID correctly associated');

  // B3: List staff profiles
  const listRes = await request('GET', '/staff?page=1&limit=10', null, tokens.OWNER);
  assert(listRes.status === 200, 'Owner lists staff profiles -> 200 OK');
  assert(Array.isArray(listRes.data?.data?.items) && listRes.data?.data?.meta?.total >= 2, 'Pagination meta and items array verified');

  // B4: Filter staff profiles by role & shift
  const filterRes = await request('GET', `/staff?role=SECURITY&shift=NIGHT`, null, tokens.MANAGER);
  assert(filterRes.status === 200, 'Filter staff by role and shift -> 200 OK');
  const allMatch = filterRes.data?.data?.items?.every(s => s.role === 'SECURITY' && s.shift === 'NIGHT');
  assert(allMatch, 'Filtered staff members match queried criteria');

  // B5: Retrieve staff details by ID
  const detailRes = await request('GET', `/staff/${staff1Id}`, null, tokens.OWNER);
  assert(detailRes.status === 200, 'Get staff details by UUID -> 200 OK');
  assert(detailRes.data?.data?.id === staff1Id && !detailRes.data?.data?.users?.passwordHash, 'Details returned without passwordHash leakage');

  // B6: Update staff profile details
  const updatePayload = {
    role: 'CHIEF_WARDEN',
    salary: 25000,
    phone: `+919899${runId}`,
  };
  const updateRes = await request('PATCH', `/staff/${staff1Id}`, updatePayload, tokens.MANAGER);
  assert(updateRes.status === 200, 'Manager updates staff details -> 200 OK');
  assert(updateRes.data?.data?.role === 'CHIEF_WARDEN' && Number(updateRes.data?.data?.salary) === 25000, 'Updated role and salary verified');

  // B7: Status update - change status to ON_LEAVE
  const leaveStatusRes = await request('PATCH', `/staff/${staff1Id}`, { status: 'ON_LEAVE' }, tokens.OWNER);
  assert(leaveStatusRes.status === 200 && leaveStatusRes.data?.data?.status === 'ON_LEAVE', 'Staff status updated to ON_LEAVE');

  // B8: Status update - re-activate staff to ACTIVE
  const activeStatusRes = await request('PATCH', `/staff/${staff1Id}`, { status: 'ACTIVE' }, tokens.OWNER);
  assert(activeStatusRes.status === 200 && activeStatusRes.data?.data?.status === 'ACTIVE', 'Staff status re-activated to ACTIVE');

  // B9: Soft-deactivation via DELETE endpoint
  const deleteRes = await request('DELETE', `/staff/${staff1Id}`, null, tokens.MANAGER);
  assert(deleteRes.status === 200, 'Manager calls DELETE /staff/:id -> 200 OK');
  assert(deleteRes.data?.data?.deleted === true || deleteRes.data?.data?.deactivated === true, 'Staff soft-deactivated or deleted successfully');

  // B10: Re-create or re-activate staff1 for subsequent tests
  const staff1Re = await request('POST', '/staff', staff1Payload, tokens.OWNER);
  const activeStaff1Id = staff1Re.data?.data?.id;
  if (activeStaff1Id) createdStaffIds.push(activeStaff1Id);
  assert(staff1Re.status === 201, 'Re-create active staff for attendance tests -> 201 Created');

  // ==========================================
  // SECTION C: VALIDATION
  // ==========================================
  console.log('\n--- SECTION C: VALIDATION ---');

  // C1: Invalid UUID format
  const c1 = await request('GET', '/staff/invalid-not-uuid', null, tokens.OWNER);
  assert(c1.status === 400, 'Invalid UUID on GET /staff/:id -> 400 Bad Request');

  // C2: Missing required fullName
  const c2 = await request('POST', '/staff', { role: 'CLEANING', phone: '+919999999999' }, tokens.OWNER);
  assert(c2.status === 400, 'Missing fullName on create -> 400 Bad Request');

  // C3: Missing required phone
  const c3 = await request('POST', '/staff', { fullName: 'No Phone', role: 'CLEANING' }, tokens.OWNER);
  assert(c3.status === 400, 'Missing phone on create -> 400 Bad Request');

  // C4: Invalid shift enum
  const c4 = await request('POST', '/staff', { fullName: 'Test', role: 'ROLE', phone: '+919876543210', shift: 'INVALID_SHIFT' }, tokens.OWNER);
  assert(c4.status === 400, 'Invalid shift enum value -> 400 Bad Request');

  // C5: Unknown non-whitelisted field
  const c5 = await request('POST', '/staff', { ...staff1Payload, unknownInjectedField: 'hack' }, tokens.OWNER);
  assert(c5.status === 400, 'Unknown non-whitelisted property rejected -> 400 Bad Request');

  // C6: Negative salary validation
  const c6 = await request('POST', '/staff', { fullName: 'Test', role: 'ROLE', phone: '+919876543210', salary: -500 }, tokens.OWNER);
  assert(c6.status === 400, 'Negative salary value rejected -> 400 Bad Request');

  // ==========================================
  // SECTION D: STAFF ISOLATION
  // ==========================================
  console.log('\n--- SECTION D: STAFF ISOLATION ---');

  // D1: Retrieve non-existent staff UUID
  const d1 = await request('GET', '/staff/00000000-0000-0000-0000-000000000000', null, tokens.OWNER);
  assert(d1.status === 404, 'Non-existent staff ID -> 404 Not Found');

  // D2: Create staff with non-existent propertyId
  const d2 = await request('POST', '/staff', { fullName: 'Test Prop', role: 'ROLE', phone: '+919876543210', propertyId: '00000000-0000-0000-0000-000000000000' }, tokens.OWNER);
  assert(d2.status === 404, 'Non-existent property ID -> 404 Not Found');

  // D3: Cross-organization staff access
  const d3 = await request('GET', `/staff/${activeStaff1Id}`, null, tokens.OWNER, CROSS_ORG_ID);
  assert(d3.status === 403 || d3.status === 404, 'Cross-org staff retrieval -> 403/404 Forbidden/Not Found');

  // D4: Cross-organization staff update
  const d4 = await request('PATCH', `/staff/${activeStaff1Id}`, { fullName: 'Cross Attack' }, tokens.OWNER, CROSS_ORG_ID);
  assert(d4.status === 403 || d4.status === 404, 'Cross-org staff update -> 403/404 Forbidden/Not Found');

  // ==========================================
  // SECTION E: ATTENDANCE LIFECYCLE
  // ==========================================
  console.log('\n--- SECTION E: ATTENDANCE LIFECYCLE ---');

  const testDate1 = '2026-10-15';
  const testDate2 = '2026-10-16';
  const testDate3 = '2026-10-17';

  // E1: Admin records manual attendance entry
  const manualAttPayload = {
    staffId: activeStaff1Id,
    date: testDate1,
    status: 'PRESENT',
    checkInTime: '08:45',
    checkOutTime: '17:30',
    notes: 'Shift completed with overtime',
  };
  const e1Res = await request('POST', '/staff-attendance', manualAttPayload, tokens.OWNER);
  assert(e1Res.status === 201, 'Owner records manual attendance -> 201 Created');
  const att1 = e1Res.data?.data;
  const att1Id = att1?.id;
  if (att1Id) createdAttendanceIds.push(att1Id);
  assert(att1?.status === 'PRESENT' && att1?.checkInTime === '08:45', 'Manual attendance fields verified');

  // E2: Admin check-in on behalf of staff for date 2
  const checkInPayload = {
    staffId: activeStaff1Id,
    date: testDate2,
    checkInTime: '09:00',
    notes: 'Morning reporting',
  };
  const e2Res = await request('POST', '/staff-attendance/check-in', checkInPayload, tokens.MANAGER);
  assert(e2Res.status === 200, 'Manager records staff check-in -> 200 OK');
  const att2 = e2Res.data?.data;
  const att2Id = att2?.id;
  if (att2Id) createdAttendanceIds.push(att2Id);
  assert(att2?.checkInTime === '09:00' && att2?.status === 'PRESENT', 'Check-in time recorded successfully');

  // E3: Admin check-out for date 2
  const checkOutPayload = {
    staffId: activeStaff1Id,
    date: testDate2,
    checkOutTime: '18:15',
    notes: 'Evening handover complete',
  };
  const e3Res = await request('POST', '/staff-attendance/check-out', checkOutPayload, tokens.MANAGER);
  assert(e3Res.status === 200, 'Manager records staff check-out -> 200 OK');
  assert(e3Res.data?.data?.checkOutTime === '18:15', 'Check-out time recorded successfully');

  // E4: Get attendance record details by UUID
  const e4Res = await request('GET', `/staff-attendance/${att2Id}`, null, tokens.OWNER);
  assert(e4Res.status === 200, 'Get attendance record by UUID -> 200 OK');
  assert(e4Res.data?.data?.id === att2Id, 'Attendance record ID matches');

  // E5: List attendance records
  const e5Res = await request('GET', '/staff-attendance?page=1&limit=10', null, tokens.OWNER);
  assert(e5Res.status === 200, 'List attendance records -> 200 OK');
  assert(Array.isArray(e5Res.data?.data?.items) && e5Res.data?.data?.meta?.total >= 2, 'Attendance listing items and meta returned');

  // E6: Filter attendance by staffId
  const e6Res = await request('GET', `/staff-attendance?staffId=${activeStaff1Id}`, null, tokens.MANAGER);
  assert(e6Res.status === 200, 'Filter attendance by staffId -> 200 OK');
  const matchStaff = e6Res.data?.data?.items?.every(a => a.staffId === activeStaff1Id);
  assert(matchStaff, 'All returned attendances match filtered staffId');

  // E7: Filter attendance by status
  const e7Res = await request('GET', `/staff-attendance?status=PRESENT`, null, tokens.OWNER);
  assert(e7Res.status === 200, 'Filter attendance by status=PRESENT -> 200 OK');
  assert(e7Res.data?.data?.items?.every(a => a.status === 'PRESENT'), 'All items match PRESENT status');

  // E8: Filter attendance by date range
  const e8Res = await request('GET', `/staff-attendance?startDate=${testDate1}&endDate=${testDate2}`, null, tokens.OWNER);
  assert(e8Res.status === 200, 'Filter attendance by date range -> 200 OK');
  assert(e8Res.data?.data?.items?.length >= 2, 'Date range filter returns expected records');

  // E9: Staff attendance history endpoint
  const e9Res = await request('GET', `/staff/${activeStaff1Id}/attendance`, null, tokens.OWNER);
  assert(e9Res.status === 200, 'Get /staff/:id/attendance history -> 200 OK');
  assert(Array.isArray(e9Res.data?.data?.items) && e9Res.data?.data?.meta?.total >= 2, 'Staff history items and meta verified');

  // E10: Admin updates attendance record
  const e10Res = await request('PATCH', `/staff-attendance/${att1Id}`, { status: 'HALF_DAY', notes: 'Converted to half day' }, tokens.MANAGER);
  assert(e10Res.status === 200, 'Manager updates attendance record -> 200 OK');
  assert(e10Res.data?.data?.status === 'HALF_DAY', 'Attendance status updated to HALF_DAY');

  // ==========================================
  // SECTION F: DUPLICATE PROTECTION
  // ==========================================
  console.log('\n--- SECTION F: DUPLICATE PROTECTION ---');

  // F1: Duplicate check-in for the same date -> 409 Conflict
  const f1Res = await request('POST', '/staff-attendance/check-in', { staffId: activeStaff1Id, date: testDate2, checkInTime: '09:30' }, tokens.OWNER);
  assert(f1Res.status === 409, 'Duplicate check-in for same date returns 409 Conflict');

  // F2: Duplicate manual attendance creation for same (staffId, date) -> 409 Conflict
  const f2Res = await request('POST', '/staff-attendance', { staffId: activeStaff1Id, date: testDate1, status: 'PRESENT' }, tokens.OWNER);
  assert(f2Res.status === 409, 'Duplicate attendance creation returns 409 Conflict');

  // F3: Duplicate check-out for already checked-out record -> 400 Bad Request
  const f3Res = await request('POST', '/staff-attendance/check-out', { staffId: activeStaff1Id, date: testDate2, checkOutTime: '19:00' }, tokens.OWNER);
  assert(f3Res.status === 400, 'Duplicate check-out attempt returns 400 Bad Request');

  // F4: Check-out without prior check-in -> 400 Bad Request
  const f4Res = await request('POST', '/staff-attendance/check-out', { staffId: activeStaff1Id, date: '2026-11-01', checkOutTime: '18:00' }, tokens.OWNER);
  assert(f4Res.status === 400, 'Check-out without prior check-in returns 400 Bad Request');

  // ==========================================
  // SECTION G: SELF-SERVICE ATTENDANCE
  // ==========================================
  console.log('\n--- SECTION G: SELF-SERVICE ATTENDANCE ---');

  // Seeded staff profile for USERS.STAFF (staff@blrstays.com)
  const defaultStaffProfile = await prisma.staff_profiles.findFirst({
    where: { userId: USERS.STAFF.userId, organizationId: ORG_ID },
  });
  const defaultStaffId = defaultStaffProfile?.id;
  const selfServiceDate = '2026-10-22';

  // G1: Authenticated STAFF user self-service check-in (no staffId passed)
  const g1Res = await request('POST', '/staff-attendance/check-in', { date: selfServiceDate, checkInTime: '09:05' }, tokens.STAFF);
  assert(g1Res.status === 200, 'Staff user self-service check-in without staffId -> 200 OK');
  const selfAttId = g1Res.data?.data?.id;
  if (selfAttId) createdAttendanceIds.push(selfAttId);
  assert(g1Res.data?.data?.staffId === defaultStaffId, 'Self-service check-in auto-resolved authenticated user staff profile');

  // G2: Authenticated STAFF user self-service check-out
  const g2Res = await request('POST', '/staff-attendance/check-out', { date: selfServiceDate, checkOutTime: '17:55' }, tokens.STAFF);
  assert(g2Res.status === 200, 'Staff user self-service check-out without staffId -> 200 OK');
  assert(g2Res.data?.data?.checkOutTime === '17:55', 'Self-service check-out recorded');

  // G3: STAFF user tries to check-in for another staff member -> 403 Forbidden
  const g3Res = await request('POST', '/staff-attendance/check-in', { staffId: activeStaff1Id, date: '2026-10-23' }, tokens.STAFF);
  assert(g3Res.status === 403, 'Staff user cannot check-in for another staff member -> 403 Forbidden');

  // G4: STAFF user tries to check-out another staff member -> 403 Forbidden
  const g4Res = await request('POST', '/staff-attendance/check-out', { staffId: activeStaff1Id, date: '2026-10-23' }, tokens.STAFF);
  assert(g4Res.status === 403, 'Staff user cannot check-out another staff member -> 403 Forbidden');

  // G5: STAFF user views own attendance history -> 200 OK
  const g5Res = await request('GET', `/staff/${defaultStaffId}/attendance`, null, tokens.STAFF);
  assert(g5Res.status === 200, 'Staff user views own attendance history -> 200 OK');

  // G6: STAFF user tries to view another staff member history -> 403 Forbidden
  const g6Res = await request('GET', `/staff/${activeStaff1Id}/attendance`, null, tokens.STAFF);
  assert(g6Res.status === 403, 'Staff user viewing foreign staff attendance history -> 403 Forbidden');

  // ==========================================
  // SECTION H: RBAC
  // ==========================================
  console.log('\n--- SECTION H: RBAC MATRIX ---');

  // H1: OWNER can create staff
  const h1 = await request('POST', '/staff', { fullName: `Owner Staff ${runId}`, role: 'SECURITY', phone: `+919111${runId}` }, tokens.OWNER);
  assert(h1.status === 201, 'OWNER has staff creation permission -> 201 Created');
  if (h1.data?.data?.id) createdStaffIds.push(h1.data?.data?.id);

  // H2: MANAGER can create staff
  const h2 = await request('POST', '/staff', { fullName: `Manager Staff ${runId}`, role: 'WARDEN', phone: `+919222${runId}` }, tokens.MANAGER);
  assert(h2.status === 201, 'MANAGER has staff creation permission -> 201 Created');
  if (h2.data?.data?.id) createdStaffIds.push(h2.data?.data?.id);

  // H3: STAFF cannot create staff profile
  const h3 = await request('POST', '/staff', { fullName: 'Staff Hack', role: 'WARDEN', phone: '+919333333333' }, tokens.STAFF);
  assert(h3.status === 403, 'STAFF role denied staff profile creation -> 403 Forbidden');

  // H4: ACCOUNTANT cannot create staff profile
  const h4 = await request('POST', '/staff', { fullName: 'Accountant Hack', role: 'WARDEN', phone: '+919444444444' }, tokens.ACCOUNTANT);
  assert(h4.status === 403, 'ACCOUNTANT role denied staff profile creation -> 403 Forbidden');

  // H5: RESIDENT cannot create staff profile
  const h5 = await request('POST', '/staff', { fullName: 'Resident Hack', role: 'WARDEN', phone: '+919555555555' }, tokens.RESIDENT);
  assert(h5.status === 403, 'RESIDENT role denied staff profile creation -> 403 Forbidden');

  // H6: RESIDENT cannot list staff profiles
  const h6 = await request('GET', '/staff', null, tokens.RESIDENT);
  assert(h6.status === 403, 'RESIDENT role denied staff listing -> 403 Forbidden');

  // H7: RESIDENT cannot access staff attendance
  const h7 = await request('GET', '/staff-attendance', null, tokens.RESIDENT);
  assert(h7.status === 403, 'RESIDENT role denied staff attendance listing -> 403 Forbidden');

  // H8: ACCOUNTANT cannot record or modify attendance
  const h8 = await request('POST', '/staff-attendance/check-in', { staffId: activeStaff1Id, date: '2026-10-25' }, tokens.ACCOUNTANT);
  assert(h8.status === 403, 'ACCOUNTANT role denied attendance mutations -> 403 Forbidden');

  // ==========================================
  // SECTION I: ORGANIZATION ISOLATION
  // ==========================================
  console.log('\n--- SECTION I: ORGANIZATION ISOLATION ---');

  // I1: Missing X-Organization-Id header
  const i1 = await request('GET', '/staff', null, tokens.OWNER, null);
  assert(i1.status === 400, 'Missing X-Organization-Id header -> 400 Bad Request');

  // I2: Invalid organization UUID
  const i2 = await request('GET', '/staff', null, tokens.OWNER, 'not-a-valid-uuid');
  assert(i2.status === 400, 'Invalid organization UUID header -> 400 Bad Request');

  // I3: Non-member organization header
  const i3 = await request('GET', '/staff', null, tokens.OWNER, CROSS_ORG_ID);
  assert(i3.status === 403, 'Non-member organization header -> 403 Forbidden');

  // I4: Cross-org attendance record retrieval
  const i4 = await request('GET', `/staff-attendance/${att1Id}`, null, tokens.OWNER, CROSS_ORG_ID);
  assert(i4.status === 403 || i4.status === 404, 'Cross-org attendance record retrieval -> 403/404 Forbidden/Not Found');

  // I5: Cross-org attendance update
  const i5 = await request('PATCH', `/staff-attendance/${att1Id}`, { notes: 'Hack' }, tokens.OWNER, CROSS_ORG_ID);
  assert(i5.status === 403 || i5.status === 404, 'Cross-org attendance update -> 403/404 Forbidden/Not Found');

  // ==========================================
  // SECTION J: PROPERTY ISOLATION
  // ==========================================
  console.log('\n--- SECTION J: PROPERTY ISOLATION ---');

  // J1: Listing attendance filtered by non-existent property
  const j1 = await request('GET', `/staff-attendance?propertyId=00000000-0000-0000-0000-000000000000`, null, tokens.OWNER);
  assert(j1.status === 200 && j1.data?.data?.items?.length === 0, 'Attendance filter by foreign property returns empty items');

  // J2: Create staff with foreign property ID
  const j2 = await request('POST', '/staff', { fullName: 'Foreign Prop Staff', role: 'ROLE', phone: '+919999999998', propertyId: '00000000-0000-0000-0000-000000000000' }, tokens.OWNER);
  assert(j2.status === 404, 'Create staff with non-org property -> 404 Not Found');

  // J3: Update staff with foreign property ID
  const j3 = await request('PATCH', `/staff/${activeStaff1Id}`, { propertyId: '00000000-0000-0000-0000-000000000000' }, tokens.OWNER);
  assert(j3.status === 404, 'Update staff with non-org property -> 404 Not Found');

  // ==========================================
  // SECTION K: AUDIT LOGS
  // ==========================================
  console.log('\n--- SECTION K: AUDIT LOGS ---');

  const staffLogs = await prisma.audit_logs.findMany({
    where: { organizationId: ORG_ID, entityType: 'staff_profiles' },
  });
  const attLogs = await prisma.audit_logs.findMany({
    where: { organizationId: ORG_ID, entityType: 'staff_attendances' },
  });

  const createdLog = staffLogs.find(l => l.action === 'staff.created');
  const updatedLog = staffLogs.find(l => l.action === 'staff.updated' || l.action === 'staff.deactivated');
  const checkInLog = attLogs.find(l => l.action === 'staff_attendance.checked_in');
  const checkOutLog = attLogs.find(l => l.action === 'staff_attendance.checked_out');

  assert(!!createdLog, 'Audit log recorded for staff.created');
  assert(!!updatedLog, 'Audit log recorded for staff.updated / staff.deactivated');
  assert(!!checkInLog, 'Audit log recorded for staff_attendance.checked_in');
  assert(!!checkOutLog, 'Audit log recorded for staff_attendance.checked_out');

  const allLogs = [...staffLogs, ...attLogs];
  const leaksSecret = allLogs.some(l => {
    const s = JSON.stringify(l);
    return s.includes('passwordHash') || s.includes('jwtSecret') || s.includes('refreshToken');
  });
  assert(!leaksSecret, 'Audit log entries contain no leaked passwords or tokens');

  // ==========================================
  // SECTION L: DATA INTEGRITY
  // ==========================================
  console.log('\n--- SECTION L: DATA INTEGRITY ---');

  const allStaff = await prisma.staff_profiles.findMany({ select: { organizationId: true } });
  const allOrgIds = (await prisma.organizations.findMany({ select: { id: true } })).map(o => o.id);
  const orphanStaff = allStaff.filter(s => !allOrgIds.includes(s.organizationId)).length;
  assert(orphanStaff === 0, 'No orphaned staff profiles without organization relation');

  const allAttendances = await prisma.staff_attendances.findMany({ select: { staffId: true } });
  const allStaffIds = (await prisma.staff_profiles.findMany({ select: { id: true } })).map(s => s.id);
  const orphanAtt = allAttendances.filter(a => !allStaffIds.includes(a.staffId)).length;
  assert(orphanAtt === 0, 'No orphaned staff attendance records without staff relation');

  const activeStaffRecord = await prisma.staff_profiles.findUnique({
    where: { id: activeStaff1Id },
  });
  assert(activeStaffRecord?.organizationId === ORG_ID, 'Staff record maintains valid organization association');

  const detailSafe = await request('GET', `/staff/${activeStaff1Id}`, null, tokens.OWNER);
  const detailStr = JSON.stringify(detailSafe.data);
  assert(!detailStr.includes('passwordHash') && !detailStr.includes('refreshToken'), 'Staff response payload strictly purges passwordHash and tokens');

  // ==========================================
  // SECTION M: CONCURRENCY
  // ==========================================
  console.log('\n--- SECTION M: CONCURRENCY TESTS ---');

  // M1: Simultaneous check-in race
  const raceDate = '2026-10-28';
  const [raceCheckIn1, raceCheckIn2] = await Promise.all([
    request('POST', '/staff-attendance/check-in', { staffId: activeStaff1Id, date: raceDate, checkInTime: '09:00' }, tokens.OWNER),
    request('POST', '/staff-attendance/check-in', { staffId: activeStaff1Id, date: raceDate, checkInTime: '09:01' }, tokens.MANAGER),
  ]);
  const checkInStatuses = [raceCheckIn1.status, raceCheckIn2.status].sort();
  assert(checkInStatuses[0] === 200 && checkInStatuses[1] === 409, 'Concurrent check-in race: exactly 1 succeeds (200), 1 rejected (409 Conflict)');
  if (raceCheckIn1.data?.data?.id) createdAttendanceIds.push(raceCheckIn1.data.data.id);
  if (raceCheckIn2.data?.data?.id) createdAttendanceIds.push(raceCheckIn2.data.data.id);

  // M2: Simultaneous check-out race
  const [raceCheckOut1, raceCheckOut2] = await Promise.all([
    request('POST', '/staff-attendance/check-out', { staffId: activeStaff1Id, date: raceDate, checkOutTime: '18:00' }, tokens.OWNER),
    request('POST', '/staff-attendance/check-out', { staffId: activeStaff1Id, date: raceDate, checkOutTime: '18:01' }, tokens.MANAGER),
  ]);
  const checkOutStatuses = [raceCheckOut1.status, raceCheckOut2.status].sort();
  assert(checkOutStatuses[0] === 200 && checkOutStatuses[1] === 400, 'Concurrent check-out race: exactly 1 succeeds (200), 1 rejected (400 Bad Request)');

  // M3: Concurrent manual attendance race
  const manualRaceDate = '2026-10-29';
  const [raceManual1, raceManual2] = await Promise.all([
    request('POST', '/staff-attendance', { staffId: activeStaff1Id, date: manualRaceDate, status: 'PRESENT' }, tokens.OWNER),
    request('POST', '/staff-attendance', { staffId: activeStaff1Id, date: manualRaceDate, status: 'PRESENT' }, tokens.MANAGER),
  ]);
  const manualStatuses = [raceManual1.status, raceManual2.status].sort();
  assert(manualStatuses[0] === 201 && manualStatuses[1] === 409, 'Concurrent manual attendance creation: exactly 1 succeeds (201), 1 rejected (409 Conflict)');
  if (raceManual1.data?.data?.id) createdAttendanceIds.push(raceManual1.data.data.id);
  if (raceManual2.data?.data?.id) createdAttendanceIds.push(raceManual2.data.data.id);

  // ==========================================
  // CLEANUP CREATED TEST DATA
  // ==========================================
  console.log('\n--- CLEANING UP TEST DATA ---');
  if (createdAttendanceIds.length > 0) {
    await prisma.staff_attendances.deleteMany({
      where: { id: { in: createdAttendanceIds } },
    });
  }
  // Delete attendances belonging to created staff before deleting staff
  if (createdStaffIds.length > 0) {
    await prisma.staff_attendances.deleteMany({
      where: { staffId: { in: createdStaffIds } },
    });
    await prisma.staff_profiles.deleteMany({
      where: { id: { in: createdStaffIds } },
    });
  }
  console.log(`Cleaned up ${createdAttendanceIds.length} attendance records and ${createdStaffIds.length} test staff profiles.`);

  // SUMMARY
  console.log('\n==========================================');
  console.log(`PHASE 15 TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('==========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
