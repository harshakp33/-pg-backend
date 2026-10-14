const { PrismaClient } = require('./node_modules/@prisma/client');
const jwt = require('./node_modules/jsonwebtoken');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
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
const NON_EXISTENT_PROPERTY_ID = '00000000-0000-0000-0000-000000000000';
const INVALID_UUID = 'not-a-valid-uuid';

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
    console.log(`  ✔ PASS: ${message}`);
    passed++;
  } else {
    console.log(`  ✖ FAIL: ${message}`);
    failed++;
  }
}

async function request(method, path, body = null, token = null, orgId = ORG_ID) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (orgId !== undefined && orgId !== null) headers['X-Organization-Id'] = orgId;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

async function runTests() {
  console.log('====================================================');
  console.log('PHASE 17 — SETTINGS & SYSTEM ADMINISTRATION TESTS');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // SECTION A — Authentication & Setup
  // ----------------------------------------------------
  console.log('--- SECTION A: Authentication & Tokens ---');
  assert(Boolean(tokens.OWNER), 'OWNER JWT token successfully signed');
  assert(Boolean(tokens.MANAGER), 'MANAGER JWT token successfully signed');
  assert(Boolean(tokens.ACCOUNTANT), 'ACCOUNTANT JWT token successfully signed');
  assert(Boolean(tokens.STAFF), 'STAFF JWT token successfully signed');
  assert(Boolean(tokens.RESIDENT), 'RESIDENT JWT token successfully signed');

  // ----------------------------------------------------
  // SECTION B — Organization Settings
  // ----------------------------------------------------
  console.log('\n--- SECTION B: Organization Settings ---');
  const orgGetOwner = await request('GET', '/settings/organization', null, tokens.OWNER);
  assert(orgGetOwner.status === 200, 'GET /settings/organization returns 200 for OWNER');
  const orgData = orgGetOwner.data?.data || {};
  assert(orgData.id === ORG_ID, 'GET /settings/organization returns correct organizationId');
  assert(typeof orgData.name === 'string' && orgData.name.length > 0, 'Organization contains valid name');
  assert(orgData.passwordHash === undefined, 'Organization response never exposes passwordHash');
  assert(orgData.secret === undefined, 'Organization response never exposes internal secrets');

  const orgGetResident = await request('GET', '/settings/organization', null, tokens.RESIDENT);
  assert(orgGetResident.status === 200, 'GET /settings/organization returns 200 for RESIDENT (read-only allowed)');

  const orgGetStaff = await request('GET', '/settings/organization', null, tokens.STAFF);
  assert(orgGetStaff.status === 200, 'GET /settings/organization returns 200 for STAFF');

  const orgGetAccountant = await request('GET', '/settings/organization', null, tokens.ACCOUNTANT);
  assert(orgGetAccountant.status === 200, 'GET /settings/organization returns 200 for ACCOUNTANT');

  const orgPatchOwner = await request('PATCH', '/settings/organization', {
    phone: '+91 98800 11223',
    city: 'Bengaluru',
  }, tokens.OWNER);
  assert(orgPatchOwner.status === 200, 'PATCH /settings/organization returns 200 for OWNER');
  assert(orgPatchOwner.data?.data?.city === 'Bengaluru', 'PATCH /settings/organization successfully updates city');

  const orgPatchManager = await request('PATCH', '/settings/organization', {
    state: 'Karnataka',
  }, tokens.MANAGER);
  assert(orgPatchManager.status === 200, 'PATCH /settings/organization returns 200 for MANAGER');

  const orgPatchResident = await request('PATCH', '/settings/organization', {
    city: 'HackedCity',
  }, tokens.RESIDENT);
  assert(orgPatchResident.status === 403, 'PATCH /settings/organization forbidden (403) for RESIDENT');

  const orgPatchStaff = await request('PATCH', '/settings/organization', {
    city: 'HackedCity',
  }, tokens.STAFF);
  assert(orgPatchStaff.status === 403, 'PATCH /settings/organization forbidden (403) for STAFF');

  const orgPatchAccountant = await request('PATCH', '/settings/organization', {
    city: 'HackedCity',
  }, tokens.ACCOUNTANT);
  assert(orgPatchAccountant.status === 403, 'PATCH /settings/organization forbidden (403) for ACCOUNTANT');

  const orgPatchInvalid = await request('PATCH', '/settings/organization', {
    email: 'not-an-email',
  }, tokens.OWNER);
  assert(orgPatchInvalid.status === 400, 'PATCH /settings/organization rejects invalid email format');

  const orgPatchUnknown = await request('PATCH', '/settings/organization', {
    unknownField: 'malicious',
  }, tokens.OWNER);
  assert(orgPatchUnknown.status === 400, 'PATCH /settings/organization rejects non-whitelisted fields');

  // ----------------------------------------------------
  // SECTION C — Property Settings
  // ----------------------------------------------------
  console.log('\n--- SECTION C: Property Settings ---');
  const propGet = await request('GET', `/settings/properties/${PROPERTY_ID}`, null, tokens.OWNER);
  assert(propGet.status === 200, 'GET /settings/properties/:propertyId returns 200 for OWNER');
  const propData = propGet.data?.data || {};
  assert(propData.propertyId === PROPERTY_ID, 'Property settings matches requested propertyId');
  assert(typeof propData.billingCycleDay === 'number', 'Property settings returns numeric billingCycleDay');
  assert(typeof propData.lateFeePerDay === 'number', 'Property settings returns numeric lateFeePerDay');
  assert(typeof propData.electricityRatePerUnit === 'number', 'Property settings returns numeric electricityRatePerUnit');
  assert(typeof propData.curfewTime === 'string', 'Property settings returns curfewTime string');

  const propGetResident = await request('GET', `/settings/properties/${PROPERTY_ID}`, null, tokens.RESIDENT);
  assert(propGetResident.status === 200, 'GET /settings/properties/:propertyId returns 200 for RESIDENT');

  const propPatchOwner = await request('PATCH', `/settings/properties/${PROPERTY_ID}`, {
    curfewTime: '22:45',
    lateFeePerDay: 75.0,
    noticePeriodDays: 30,
  }, tokens.OWNER);
  assert(propPatchOwner.status === 200, 'PATCH /settings/properties/:propertyId returns 200 for OWNER');
  assert(propPatchOwner.data?.data?.curfewTime === '22:45', 'Property curfew time successfully updated');
  assert(propPatchOwner.data?.data?.lateFeePerDay === 75, 'Property late fee successfully updated');

  const propPatchManager = await request('PATCH', `/settings/properties/${PROPERTY_ID}`, {
    gracePeriodDays: 7,
  }, tokens.MANAGER);
  assert(propPatchManager.status === 200, 'PATCH /settings/properties/:propertyId returns 200 for MANAGER');

  const propPatchResident = await request('PATCH', `/settings/properties/${PROPERTY_ID}`, {
    curfewTime: '00:00',
  }, tokens.RESIDENT);
  assert(propPatchResident.status === 403, 'PATCH /settings/properties/:propertyId forbidden (403) for RESIDENT');

  const propPatchStaff = await request('PATCH', `/settings/properties/${PROPERTY_ID}`, {
    curfewTime: '00:00',
  }, tokens.STAFF);
  assert(propPatchStaff.status === 403, 'PATCH /settings/properties/:propertyId forbidden (403) for STAFF');

  const propPatchAccountant = await request('PATCH', `/settings/properties/${PROPERTY_ID}`, {
    curfewTime: '00:00',
  }, tokens.ACCOUNTANT);
  assert(propPatchAccountant.status === 403, 'PATCH /settings/properties/:propertyId forbidden (403) for ACCOUNTANT');

  const propNotFound = await request('GET', `/settings/properties/${NON_EXISTENT_PROPERTY_ID}`, null, tokens.OWNER);
  assert(propNotFound.status === 404, 'GET property settings returns 404 for non-existent property');

  const propInvalidBillingDay = await request('PATCH', `/settings/properties/${PROPERTY_ID}`, {
    billingCycleDay: 35,
  }, tokens.OWNER);
  assert(propInvalidBillingDay.status === 400, 'Property settings rejects billingCycleDay > 31');

  // ----------------------------------------------------
  // SECTION D — User Profile
  // ----------------------------------------------------
  console.log('\n--- SECTION D: User Profile ---');
  const profGetOwner = await request('GET', '/settings/profile', null, tokens.OWNER);
  assert(profGetOwner.status === 200, 'GET /settings/profile returns 200 for OWNER');
  const profData = profGetOwner.data?.data || {};
  assert(profData.id === USERS.OWNER.userId, 'Profile matches authenticated user ID');
  assert(profData.email === USERS.OWNER.email, 'Profile matches authenticated user email');
  assert(profData.passwordHash === undefined, 'Profile response NEVER exposes passwordHash');
  assert(profData.deletedAt === undefined, 'Profile response does not expose deletedAt internal');

  const profGetResident = await request('GET', '/settings/profile', null, tokens.RESIDENT);
  assert(profGetResident.status === 200, 'GET /settings/profile returns 200 for RESIDENT');
  assert(profGetResident.data?.data?.id === USERS.RESIDENT.userId, 'Resident profile matches resident userId');

  const profPatchOwner = await request('PATCH', '/settings/profile', {
    firstName: 'Bangalore',
    lastName: 'Owner',
  }, tokens.OWNER);
  assert(profPatchOwner.status === 200, 'PATCH /settings/profile returns 200 for OWNER');
  assert(profPatchOwner.data?.data?.firstName === 'Bangalore', 'Profile firstName updated successfully');

  const profPatchPrivilege = await request('PATCH', '/settings/profile', {
    role: 'SUPERADMIN',
    isActive: false,
    email: 'newemail@hacked.com',
  }, tokens.OWNER);
  assert(profPatchPrivilege.status === 400, 'PATCH /settings/profile rejects role or system field tampering');

  const profPatchResident = await request('PATCH', '/settings/profile', {
    phone: '+91 99999 88888',
  }, tokens.RESIDENT);
  assert(profPatchResident.status === 200, 'PATCH /settings/profile allows RESIDENT to update own phone');

  // ----------------------------------------------------
  // SECTION E — Organization Members
  // ----------------------------------------------------
  console.log('\n--- SECTION E: Organization Members ---');
  const membersListOwner = await request('GET', '/settings/members', null, tokens.OWNER);
  assert(membersListOwner.status === 200, 'GET /settings/members returns 200 for OWNER');
  const membersData = membersListOwner.data?.data || {};
  assert(Array.isArray(membersData.items), 'Members response contains items array');
  assert(membersData.meta && typeof membersData.meta.total === 'number', 'Members response contains pagination meta');
  assert(membersData.meta.page === 1, 'Members pagination defaults to page 1');

  const membersListManager = await request('GET', '/settings/members', null, tokens.MANAGER);
  assert(membersListManager.status === 200, 'GET /settings/members returns 200 for MANAGER');

  const membersListResident = await request('GET', '/settings/members', null, tokens.RESIDENT);
  assert(membersListResident.status === 403, 'GET /settings/members forbidden (403) for RESIDENT');

  const membersListStaff = await request('GET', '/settings/members', null, tokens.STAFF);
  assert(membersListStaff.status === 403, 'GET /settings/members forbidden (403) for STAFF');

  const membersListAccountant = await request('GET', '/settings/members', null, tokens.ACCOUNTANT);
  assert(membersListAccountant.status === 403, 'GET /settings/members forbidden (403) for ACCOUNTANT');

  const targetMember = membersData.items.find(m => !m.isPrimaryOwner);
  const primaryOwnerMember = membersData.items.find(m => m.isPrimaryOwner);
  assert(Boolean(primaryOwnerMember), 'Organization has a primary owner');

  if (targetMember) {
    const memberDetail = await request('GET', `/settings/members/${targetMember.id}`, null, tokens.OWNER);
    assert(memberDetail.status === 200, 'GET /settings/members/:membershipId returns 200 for OWNER');
    assert(memberDetail.data?.data?.user?.passwordHash === undefined, 'Member detail never exposes user passwordHash');

    const updateManager = await request('PATCH', `/settings/members/${targetMember.id}`, {
      status: 'ACTIVE',
    }, tokens.MANAGER);
    assert(updateManager.status === 403, 'PATCH /settings/members/:membershipId forbidden for MANAGER (Owner only)');

    const updateResident = await request('PATCH', `/settings/members/${targetMember.id}`, {
      status: 'SUSPENDED',
    }, tokens.RESIDENT);
    assert(updateResident.status === 403, 'PATCH /settings/members/:membershipId forbidden for RESIDENT');

    const updateStatusOwner = await request('PATCH', `/settings/members/${targetMember.id}`, {
      status: 'ACTIVE',
    }, tokens.OWNER);
    assert(updateStatusOwner.status === 200, 'PATCH /settings/members/:membershipId returns 200 for OWNER');
  }

  if (primaryOwnerMember) {
    const deactivatePrimary = await request('PATCH', `/settings/members/${primaryOwnerMember.id}`, {
      status: 'SUSPENDED',
    }, tokens.OWNER);
    assert(deactivatePrimary.status === 400, 'Primary owner deactivation prevented (400)');

    const ownerSelfRoleChange = await request('PATCH', `/settings/members/${primaryOwnerMember.id}`, {
      roleId: targetMember?.roleId || '00000000-0000-0000-0000-000000000000',
    }, tokens.OWNER);
    assert(ownerSelfRoleChange.status === 400 || ownerSelfRoleChange.status === 404, 'User cannot modify their own role (400)');
  }

  const memberNotFound = await request('GET', `/settings/members/${NON_EXISTENT_PROPERTY_ID}`, null, tokens.OWNER);
  assert(memberNotFound.status === 404, 'GET member returns 404 for non-existent membershipId');

  // ----------------------------------------------------
  // SECTION F — Roles Visibility (Read-Only)
  // ----------------------------------------------------
  console.log('\n--- SECTION F: Roles Visibility ---');
  const rolesOwner = await request('GET', '/settings/roles', null, tokens.OWNER);
  assert(rolesOwner.status === 200, 'GET /settings/roles returns 200 for OWNER');
  const rolesList = rolesOwner.data?.data || [];
  assert(Array.isArray(rolesList) && rolesList.length >= 5, 'Roles list contains system roles');
  assert(rolesList.every(r => typeof r.id === 'string' && typeof r.name === 'string'), 'Role objects contain safe fields');

  const rolesManager = await request('GET', '/settings/roles', null, tokens.MANAGER);
  assert(rolesManager.status === 200, 'GET /settings/roles returns 200 for MANAGER');

  const rolesResident = await request('GET', '/settings/roles', null, tokens.RESIDENT);
  assert(rolesResident.status === 403, 'GET /settings/roles forbidden (403) for RESIDENT');

  const firstRole = rolesList[0];
  if (firstRole) {
    const roleDetail = await request('GET', `/settings/roles/${firstRole.id}`, null, tokens.OWNER);
    assert(roleDetail.status === 200, 'GET /settings/roles/:roleId returns 200 with role details');
    assert(Array.isArray(roleDetail.data?.data?.permissions), 'Role details include permissions array');
  }

  const roleNotFound = await request('GET', `/settings/roles/${NON_EXISTENT_PROPERTY_ID}`, null, tokens.OWNER);
  assert(roleNotFound.status === 404, 'GET /settings/roles/:roleId returns 404 for non-existent roleId');

  // ----------------------------------------------------
  // SECTION G — Permissions Visibility (Read-Only)
  // ----------------------------------------------------
  console.log('\n--- SECTION G: Permissions Visibility ---');
  const permsOwner = await request('GET', '/settings/permissions', null, tokens.OWNER);
  assert(permsOwner.status === 200, 'GET /settings/permissions returns 200 for OWNER');
  const permsList = permsOwner.data?.data || [];
  assert(Array.isArray(permsList) && permsList.length === 16, 'System exposes exactly 16 existing permissions');
  assert(permsList.every(p => typeof p.code === 'string'), 'Permission objects contain valid code');

  const permsManager = await request('GET', '/settings/permissions', null, tokens.MANAGER);
  assert(permsManager.status === 200, 'GET /settings/permissions returns 200 for MANAGER');

  const permsResident = await request('GET', '/settings/permissions', null, tokens.RESIDENT);
  assert(permsResident.status === 403, 'GET /settings/permissions forbidden (403) for RESIDENT');

  if (firstRole) {
    const rolePerms = await request('GET', `/settings/roles/${firstRole.id}/permissions`, null, tokens.OWNER);
    assert(rolePerms.status === 200, 'GET /settings/roles/:roleId/permissions returns 200');
    assert(Array.isArray(rolePerms.data?.data), 'Returns permissions array for role');
  }

  // ----------------------------------------------------
  // SECTION H — Notification Preferences
  // ----------------------------------------------------
  console.log('\n--- SECTION H: Notification Preferences ---');
  const notifOwner = await request('GET', '/settings/notifications/preferences', null, tokens.OWNER);
  assert(notifOwner.status === 200, 'GET /settings/notifications/preferences returns 200 for OWNER');
  const notifList = notifOwner.data?.data || [];
  assert(Array.isArray(notifList) && notifList.length === 12, 'Notification preferences list contains 12 notification types');
  assert(notifList.every(np => typeof np.inAppEnabled === 'boolean' && typeof np.emailEnabled === 'boolean'), 'Preferences contain booleans');

  const notifResident = await request('GET', '/settings/notifications/preferences', null, tokens.RESIDENT);
  assert(notifResident.status === 200, 'GET /settings/notifications/preferences returns 200 for RESIDENT');

  const notifPatchRes = await request('PATCH', '/settings/notifications/preferences', {
    preferences: [
      { type: 'RENT_DUE', inAppEnabled: true, emailEnabled: false, smsEnabled: true, whatsappEnabled: false },
      { type: 'NOTICE_PUBLISHED', inAppEnabled: true, emailEnabled: true },
    ],
  }, tokens.RESIDENT);
  assert(notifPatchRes.status === 200, 'PATCH /settings/notifications/preferences returns 200 for RESIDENT');
  assert(Array.isArray(notifPatchRes.data?.data) && notifPatchRes.data?.data.length === 2, 'Updated 2 preferences returned');

  const notifPatchInvalid = await request('PATCH', '/settings/notifications/preferences', {
    preferences: [{ type: 'INVALID_NOTIFICATION_TYPE', inAppEnabled: true }],
  }, tokens.OWNER);
  assert(notifPatchInvalid.status === 400, 'PATCH notification preferences rejects invalid notification type');

  // ----------------------------------------------------
  // SECTION I — Security / Account Settings
  // ----------------------------------------------------
  console.log('\n--- SECTION I: Security & Account Info ---');
  const secOwner = await request('GET', '/settings/security', null, tokens.OWNER);
  assert(secOwner.status === 200, 'GET /settings/security returns 200 for OWNER');
  const secData = secOwner.data?.data || {};
  assert(secData.userId === USERS.OWNER.userId, 'Security info matches owner userId');
  assert(secData.email === USERS.OWNER.email, 'Security info matches owner email');
  assert(secData.role === 'OWNER', 'Security info correctly reports OWNER role');
  assert(secData.isPrimaryOwner === true, 'Security info reports isPrimaryOwner true for primary owner');
  assert(secData.accountActive === true, 'Security info reports active account');
  assert(typeof secData.activeSessionsCount === 'number', 'Security info reports activeSessionsCount');
  assert(secData.passwordHash === undefined, 'Security info NEVER returns passwordHash');
  assert(secData.refreshToken === undefined, 'Security info NEVER returns refresh tokens');

  const secResident = await request('GET', '/settings/security', null, tokens.RESIDENT);
  assert(secResident.status === 200, 'GET /settings/security returns 200 for RESIDENT');
  assert(secResident.data?.data?.role === 'RESIDENT', 'Security info reports RESIDENT role');

  // ----------------------------------------------------
  // SECTION J — Sessions / Refresh Token Security
  // ----------------------------------------------------
  console.log('\n--- SECTION J: Sessions Metadata ---');
  const sessOwner = await request('GET', '/settings/sessions', null, tokens.OWNER);
  assert(sessOwner.status === 200, 'GET /settings/sessions returns 200 for OWNER');
  const sessList = sessOwner.data?.data || [];
  assert(Array.isArray(sessList), 'Sessions response contains array');
  if (sessList.length > 0) {
    const s = sessList[0];
    assert(s.token === undefined, 'Session metadata NEVER exposes raw token');
    assert(s.tokenHash === undefined, 'Session metadata NEVER exposes token hash');
    assert(typeof s.id === 'string' && s.expiresAt, 'Session metadata returns safe ID and expiresAt');
  }

  // ----------------------------------------------------
  // SECTION K — Managed Documents (Read-Only)
  // ----------------------------------------------------
  console.log('\n--- SECTION K: Managed Documents ---');
  const docsRes = await request('GET', '/settings/documents', null, tokens.OWNER);
  assert(docsRes.status === 200, 'GET /settings/documents returns 200 for OWNER');
  assert(Array.isArray(docsRes.data?.data), 'Managed documents returns array');

  const docsPropRes = await request('GET', `/settings/documents?propertyId=${PROPERTY_ID}`, null, tokens.OWNER);
  assert(docsPropRes.status === 200, 'GET /settings/documents supports propertyId filter');

  const docsInvalidProp = await request('GET', `/settings/documents?propertyId=${NON_EXISTENT_PROPERTY_ID}`, null, tokens.OWNER);
  assert(docsInvalidProp.status === 404, 'GET /settings/documents returns 404 for non-existent property');

  // ----------------------------------------------------
  // SECTION L — Multi-Tenant Organization Isolation
  // ----------------------------------------------------
  console.log('\n--- SECTION L: Multi-Tenant Isolation ---');
  const crossOrgOrg = await request('GET', '/settings/organization', null, tokens.OWNER, CROSS_ORG_ID);
  assert(crossOrgOrg.status === 403, 'Cross-organization access to /settings/organization forbidden (403)');

  const crossOrgMembers = await request('GET', '/settings/members', null, tokens.OWNER, CROSS_ORG_ID);
  assert(crossOrgMembers.status === 403, 'Cross-organization access to /settings/members forbidden (403)');

  const crossOrgProp = await request('GET', `/settings/properties/${PROPERTY_ID}`, null, tokens.OWNER, CROSS_ORG_ID);
  assert(crossOrgProp.status === 403, 'Cross-organization access to /settings/properties/:id forbidden (403)');

  const crossOrgDocs = await request('GET', '/settings/documents', null, tokens.OWNER, CROSS_ORG_ID);
  assert(crossOrgDocs.status === 403, 'Cross-organization access to /settings/documents forbidden (403)');

  // ----------------------------------------------------
  // SECTION M — User Ownership Isolation
  // ----------------------------------------------------
  console.log('\n--- SECTION M: User Ownership Isolation ---');
  const resProf = await request('GET', '/settings/profile', null, tokens.RESIDENT);
  const ownProf = await request('GET', '/settings/profile', null, tokens.OWNER);
  assert(resProf.data?.data?.id !== ownProf.data?.data?.id, 'Profile endpoints strictly scoped to authenticated user');

  const resSec = await request('GET', '/settings/security', null, tokens.RESIDENT);
  const ownSec = await request('GET', '/settings/security', null, tokens.OWNER);
  assert(resSec.data?.data?.userId !== ownSec.data?.data?.userId, 'Security endpoints strictly scoped to authenticated user');

  // ----------------------------------------------------
  // SECTION N — Validation & Bad Input Handling
  // ----------------------------------------------------
  console.log('\n--- SECTION N: Validation & Bad Input ---');
  const invalidPropUuid = await request('GET', `/settings/properties/${INVALID_UUID}`, null, tokens.OWNER);
  assert(invalidPropUuid.status === 400, 'Invalid UUID for propertyId returns 400');

  const invalidMemberUuid = await request('GET', `/settings/members/${INVALID_UUID}`, null, tokens.OWNER);
  assert(invalidMemberUuid.status === 400, 'Invalid UUID for membershipId returns 400');

  const invalidRoleUuid = await request('GET', `/settings/roles/${INVALID_UUID}`, null, tokens.OWNER);
  assert(invalidRoleUuid.status === 400, 'Invalid UUID for roleId returns 400');

  const invalidPropPatchUuid = await request('PATCH', `/settings/properties/${INVALID_UUID}`, { curfewTime: '22:00' }, tokens.OWNER);
  assert(invalidPropPatchUuid.status === 400, 'Invalid UUID in PATCH property settings returns 400');

  // ----------------------------------------------------
  // SECTION O — Missing Headers & Authentication
  // ----------------------------------------------------
  console.log('\n--- SECTION O: Missing Auth & Headers ---');
  const missingToken = await request('GET', '/settings/organization', null, null);
  assert(missingToken.status === 401, 'Request without JWT returns 401 Unauthorized');

  const invalidToken = await request('GET', '/settings/organization', null, 'invalid.jwt.token');
  assert(invalidToken.status === 401, 'Request with forged JWT returns 401 Unauthorized');

  const missingOrgHeader = await request('GET', '/settings/organization', null, tokens.OWNER, null);
  assert(missingOrgHeader.status === 400, 'Request without X-Organization-Id returns 400 Bad Request');

  const invalidOrgHeader = await request('GET', '/settings/organization', null, tokens.OWNER, 'not-a-valid-uuid');
  assert(invalidOrgHeader.status === 400, 'Request with malformed X-Organization-Id returns 400 Bad Request');

  // ----------------------------------------------------
  // SECTION P — Inactive & Non-Existent Members
  // ----------------------------------------------------
  console.log('\n--- SECTION P: Inactive Membership & Invalid User ---');
  const nonMemberReq = await request('GET', '/settings/organization', null, tokens.OWNER, CROSS_ORG_ID);
  assert(nonMemberReq.status === 403, 'User not in organization membership is rejected with 403 Forbidden');

  const forgedUserToken = jwt.sign(
    { sub: '00000000-0000-0000-0000-000000000099', email: 'ghost@nowhere.com', role: 'OWNER' },
    jwtSecret,
    { expiresIn: '1h' },
  );
  const ghostReq = await request('GET', '/settings/organization', null, forgedUserToken, ORG_ID);
  assert(ghostReq.status === 401, 'User account not found in system is rejected with 401 Unauthorized');


  // ----------------------------------------------------
  // SECTION Q — Audit Logging Verification
  // ----------------------------------------------------
  console.log('\n--- SECTION Q: Audit Logging ---');
  const recentLogs = await prisma.audit_logs.findMany({
    where: {
      organizationId: ORG_ID,
      action: { in: ['organization.settings_updated', 'property.settings_updated', 'profile.updated', 'notification_preferences.updated'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  assert(recentLogs.length > 0, 'Audit logs created for administrative mutations');
  assert(recentLogs.some(l => l.action === 'organization.settings_updated'), 'organization.settings_updated audit log exists');
  assert(recentLogs.some(l => l.action === 'property.settings_updated'), 'property.settings_updated audit log exists');
  assert(recentLogs.some(l => l.action === 'profile.updated'), 'profile.updated audit log exists');
  assert(recentLogs.some(l => l.action === 'notification_preferences.updated'), 'notification_preferences.updated audit log exists');
  assert(recentLogs.every(l => !l.newValues || (!l.newValues.includes('password') && !l.newValues.includes('secret'))), 'Audit logs do not leak passwords or secrets');

  // ----------------------------------------------------
  // SECTION R — Concurrency & Transactions
  // ----------------------------------------------------
  console.log('\n--- SECTION R: Concurrency & Advisory Locks ---');
  const concurrentPropUpdates = await Promise.all([
    request('PATCH', `/settings/properties/${PROPERTY_ID}`, { curfewTime: '22:15' }, tokens.OWNER),
    request('PATCH', `/settings/properties/${PROPERTY_ID}`, { curfewTime: '22:30' }, tokens.OWNER),
    request('PATCH', `/settings/properties/${PROPERTY_ID}`, { curfewTime: '22:45' }, tokens.OWNER),
  ]);
  assert(concurrentPropUpdates.every(r => r.status === 200), 'Concurrent property settings updates succeed cleanly');

  const concurrentOrgUpdates = await Promise.all([
    request('PATCH', '/settings/organization', { pincode: '560034' }, tokens.OWNER),
    request('PATCH', '/settings/organization', { pincode: '560035' }, tokens.OWNER),
  ]);
  assert(concurrentOrgUpdates.every(r => r.status === 200), 'Concurrent organization settings updates succeed cleanly');

  const concurrentNotifUpdates = await Promise.all([
    request('PATCH', '/settings/notifications/preferences', {
      preferences: [{ type: 'RENT_DUE', inAppEnabled: true }],
    }, tokens.OWNER),
    request('PATCH', '/settings/notifications/preferences', {
      preferences: [{ type: 'RENT_DUE', inAppEnabled: false }],
    }, tokens.OWNER),
  ]);
  assert(concurrentNotifUpdates.every(r => r.status === 200), 'Concurrent notification preference updates succeed cleanly');

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`PHASE 17 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(async (e) => {
  console.error('Test runner fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
