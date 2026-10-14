
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
  console.log('=== STARTING PHASE 12 COMPREHENSIVE TEST SUITE ===\n');

  const runId = Date.now().toString().slice(-6);
  const createdNoticeIds = [];
  const createdNotificationIds = [];

  // ==========================================
  // STEP 1: AUTHENTICATION
  // ==========================================
  console.log('--- 1. AUTHENTICATION ---');
  for (const role of Object.keys(tokens)) {
    assert(!!tokens[role], `${role} JWT signed successfully`);
  }

  // ==========================================
  // STEP 2: NOTICE CREATION
  // ==========================================
  console.log('\n--- 2. NOTICE CREATION ---');
  const noticePayload = {
    title: `Wi-Fi Maintenance Notice ${runId}`,
    description: 'Scheduled maintenance for high-speed Wi-Fi network between 2 AM and 4 AM.',
    propertyId: PROPERTY_ID,
    audience: 'ALL_RESIDENTS',
    priority: 'HIGH',
    status: 'PUBLISHED',
    isPinned: true,
  };

  const ownerCreateRes = await request('POST', '/notices', noticePayload, tokens.OWNER);
  assert(ownerCreateRes.status === 201, 'OWNER creates notice -> 201 Created');
  const ownerNotice = ownerCreateRes.data?.data || ownerCreateRes.data;
  assert(ownerNotice?.title === noticePayload.title, 'Created notice has matching title');
  assert(ownerNotice?.isPinned === true, 'Created notice isPinned is true');
  assert(ownerNotice?.status === 'PUBLISHED', 'Created notice status is PUBLISHED');
  if (ownerNotice?.id) createdNoticeIds.push(ownerNotice.id);

  const managerNoticePayload = {
    title: `Emergency Plumbing Inspection ${runId}`,
    description: 'Plumbing checks in all bathrooms tomorrow morning.',
    propertyId: PROPERTY_ID,
    audience: 'ALL_RESIDENTS',
    priority: 'URGENT',
    status: 'PUBLISHED',
  };
  const mgrCreateRes = await request('POST', '/notices', managerNoticePayload, tokens.MANAGER);
  assert(mgrCreateRes.status === 201, 'MANAGER creates notice -> 201 Created');
  const mgrNotice = mgrCreateRes.data?.data || mgrCreateRes.data;
  if (mgrNotice?.id) createdNoticeIds.push(mgrNotice.id);

  // Administrative isolation: RESIDENT cannot create notices
  const resCreateRes = await request('POST', '/notices', noticePayload, tokens.RESIDENT);
  assert(resCreateRes.status === 403, 'RESIDENT creating notice -> 403 Forbidden');

  // ACCOUNTANT cannot create notices
  const accCreateRes = await request('POST', '/notices', noticePayload, tokens.ACCOUNTANT);
  assert(accCreateRes.status === 403, 'ACCOUNTANT creating notice -> 403 Forbidden');

  // STAFF cannot create notices
  const staffCreateRes = await request('POST', '/notices', noticePayload, tokens.STAFF);
  assert(staffCreateRes.status === 403, 'STAFF creating notice -> 403 Forbidden');

  // ==========================================
  // STEP 3: NOTICE LISTING
  // ==========================================
  console.log('\n--- 3. NOTICE LISTING ---');
  const listRes = await request('GET', '/notices', null, tokens.OWNER);
  assert(listRes.status === 200, 'OWNER lists notices -> 200 OK');
  const listData = listRes.data?.data || listRes.data;
  assert(Array.isArray(listData?.items), 'Returned list has items array');
  assert(listData?.items?.length >= 2, 'Listed notices contains created items');
  assert(listData?.meta?.total >= 2, 'Total notices count is accurate');

  // Filter by status
  const filterStatusRes = await request('GET', '/notices?status=PUBLISHED', null, tokens.OWNER);
  assert(filterStatusRes.status === 200, 'Filter notices by status=PUBLISHED -> 200 OK');
  const filterItems = (filterStatusRes.data?.data || filterStatusRes.data)?.items;
  assert(filterItems.every((n) => n.status === 'PUBLISHED'), 'All returned items have status PUBLISHED');

  // Filter by priority
  const filterPrioRes = await request('GET', '/notices?priority=URGENT', null, tokens.OWNER);
  assert(filterPrioRes.status === 200, 'Filter notices by priority=URGENT -> 200 OK');
  const prioItems = (filterPrioRes.data?.data || filterPrioRes.data)?.items;
  assert(prioItems.some((n) => n.priority === 'URGENT'), 'URGENT notices found in filter');

  // Search filter
  const searchRes = await request('GET', `/notices?search=${runId}`, null, tokens.OWNER);
  assert(searchRes.status === 200, 'Search notices by keyword -> 200 OK');
  const searchItems = (searchRes.data?.data || searchRes.data)?.items;
  assert(searchItems?.length >= 2, 'Search by runId returned matched notices');

  // ==========================================
  // STEP 4: NOTICE RETRIEVAL
  // ==========================================
  console.log('\n--- 4. NOTICE RETRIEVAL ---');
  const getNoticeRes = await request('GET', `/notices/${ownerNotice.id}`, null, tokens.OWNER);
  assert(getNoticeRes.status === 200, 'OWNER gets notice by ID -> 200 OK');
  const fetchedNotice = getNoticeRes.data?.data || getNoticeRes.data;
  assert(fetchedNotice?.id === ownerNotice.id, 'Retrieved notice ID matches');

  // RESIDENT retrieves published notice
  const resGetNotice = await request('GET', `/notices/${ownerNotice.id}`, null, tokens.RESIDENT);
  assert(resGetNotice.status === 200, 'RESIDENT gets published notice -> 200 OK');

  // Create DRAFT notice and ensure RESIDENT cannot access it
  const draftPayload = {
    title: `Draft Management Directive ${runId}`,
    description: 'Internal draft not for resident eyes.',
    status: 'DRAFT',
    audience: 'MANAGERS',
  };
  const draftCreateRes = await request('POST', '/notices', draftPayload, tokens.OWNER);
  const draftNotice = draftCreateRes.data?.data || draftCreateRes.data;
  if (draftNotice?.id) createdNoticeIds.push(draftNotice.id);

  const resGetDraft = await request('GET', `/notices/${draftNotice.id}`, null, tokens.RESIDENT);
  assert(resGetDraft.status === 404, 'RESIDENT accessing DRAFT notice -> 404 Not Found');

  // Non-existent notice
  const nonExistentNotice = await request('GET', `/notices/${CROSS_ORG_ID}`, null, tokens.OWNER);
  assert(nonExistentNotice.status === 404, 'Non-existent notice -> 404 Not Found');

  // ==========================================
  // STEP 5: NOTICE UPDATE
  // ==========================================
  console.log('\n--- 5. NOTICE UPDATE ---');
  const updatePayload = {
    title: `Updated Wi-Fi Maintenance Window ${runId}`,
    description: 'Maintenance rescheduled to 3 AM to 5 AM.',
    priority: 'MEDIUM',
  };
  const updateRes = await request('PATCH', `/notices/${ownerNotice.id}`, updatePayload, tokens.MANAGER);
  assert(updateRes.status === 200, 'MANAGER updates notice -> 200 OK');
  const updatedNotice = updateRes.data?.data || updateRes.data;
  assert(updatedNotice?.title === updatePayload.title, 'Updated title verified');
  assert(updatedNotice?.priority === 'MEDIUM', 'Updated priority verified');

  // Unauthorized roles cannot update
  const resUpdate = await request('PATCH', `/notices/${ownerNotice.id}`, updatePayload, tokens.RESIDENT);
  assert(resUpdate.status === 403, 'RESIDENT updating notice -> 403 Forbidden');

  const accUpdate = await request('PATCH', `/notices/${ownerNotice.id}`, updatePayload, tokens.ACCOUNTANT);
  assert(accUpdate.status === 403, 'ACCOUNTANT updating notice -> 403 Forbidden');

  const staffUpdate = await request('PATCH', `/notices/${ownerNotice.id}`, updatePayload, tokens.STAFF);
  assert(staffUpdate.status === 403, 'STAFF updating notice -> 403 Forbidden');

  // ==========================================
  // STEP 6: NOTICE DELETION/ARCHIVE & PUBLISH/UNPUBLISH
  // ==========================================
  console.log('\n--- 6. NOTICE DELETION/ARCHIVE & PUBLISH/UNPUBLISH ---');
  // 6.1 Unpublish notice (reverts to DRAFT)
  const unpubRes = await request('PATCH', `/notices/${ownerNotice.id}/unpublish`, {}, tokens.OWNER);
  assert(unpubRes.status === 200, 'OWNER unpublishes notice -> 200 OK');
  const unpubNotice = unpubRes.data?.data || unpubRes.data;
  assert(unpubNotice?.status === 'DRAFT', 'Notice status reverted to DRAFT');

  // 6.2 Publish notice
  const pubRes = await request('PATCH', `/notices/${ownerNotice.id}/publish`, {}, tokens.MANAGER);
  assert(pubRes.status === 200, 'MANAGER publishes notice -> 200 OK');
  const pubNotice = pubRes.data?.data || pubRes.data;
  assert(pubNotice?.status === 'PUBLISHED', 'Notice status updated to PUBLISHED');

  // 6.3 Soft archive notice
  const archiveRes = await request('DELETE', `/notices/${ownerNotice.id}`, null, tokens.MANAGER);
  assert(archiveRes.status === 200, 'MANAGER archives notice -> 200 OK');
  const archivedData = archiveRes.data?.data || archiveRes.data;
  assert(archivedData?.notice?.status === 'ARCHIVED', 'Notice status updated to ARCHIVED');

  // 6.4 Permanent delete
  const permNoticePayload = {
    title: `Temporary Test Notice ${runId}`,
    description: 'To be permanently deleted',
    status: 'ARCHIVED',
  };
  const tempNoticeRes = await request('POST', '/notices', permNoticePayload, tokens.OWNER);
  const tempNotice = tempNoticeRes.data?.data || tempNoticeRes.data;
  const permDeleteRes = await request('DELETE', `/notices/${tempNotice.id}?permanent=true`, null, tokens.OWNER);
  assert(permDeleteRes.status === 200, 'OWNER permanently deletes notice -> 200 OK');
  const checkDeleted = await request('GET', `/notices/${tempNotice.id}`, null, tokens.OWNER);
  assert(checkDeleted.status === 404, 'Permanently deleted notice returns 404 Not Found');

  // ==========================================
  // STEP 7: NOTICE VALIDATION
  // ==========================================
  console.log('\n--- 7. NOTICE VALIDATION ---');
  // Missing required title -> 400
  const noTitleRes = await request('POST', '/notices', { description: 'Missing title' }, tokens.OWNER);
  assert(noTitleRes.status === 400, 'Missing title -> 400 Bad Request');

  // Missing required description -> 400
  const noDescRes = await request('POST', '/notices', { title: 'Missing description' }, tokens.OWNER);
  assert(noDescRes.status === 400, 'Missing description -> 400 Bad Request');

  // Invalid enum audience -> 400
  const badAudienceRes = await request('POST', '/notices', {
    title: 'Bad Audience',
    description: 'Testing invalid enum',
    audience: 'ALIENS',
  }, tokens.OWNER);
  assert(badAudienceRes.status === 400, 'Invalid audience enum -> 400 Bad Request');

  // Invalid enum priority -> 400
  const badPrioRes = await request('POST', '/notices', {
    title: 'Bad Priority',
    description: 'Testing invalid priority',
    priority: 'CRITICAL_MAX',
  }, tokens.OWNER);
  assert(badPrioRes.status === 400, 'Invalid priority enum -> 400 Bad Request');

  // Non-whitelisted field -> 400
  const extraFieldRes = await request('POST', '/notices', {
    title: 'Hacked Notice',
    description: 'Test body',
    hackerField: 'malicious-data',
  }, tokens.OWNER);
  assert(extraFieldRes.status === 400, 'Non-whitelisted field -> 400 Bad Request');

  // ==========================================
  // STEP 8: NOTICE PAGINATION
  // ==========================================
  console.log('\n--- 8. NOTICE PAGINATION ---');
  const pageRes = await request('GET', '/notices?page=1&limit=1', null, tokens.OWNER);
  assert(pageRes.status === 200, 'GET /notices with pagination -> 200 OK');
  const pageData = pageRes.data?.data || pageRes.data;
  assert(pageData?.items?.length <= 1, 'Items count <= limit');
  assert(pageData?.meta?.page === 1, 'meta.page is 1');
  assert(pageData?.meta?.limit === 1, 'meta.limit is 1');
  assert(pageData?.meta?.totalPages >= 1, 'meta.totalPages is computed');

  // ==========================================
  // STEP 9: NOTIFICATION CREATION & LISTING
  // ==========================================
  console.log('\n--- 9. NOTIFICATION LISTING ---');
  // Create notifications for OWNER and RESIDENT
  const ownerNotifPayload = {
    userId: USERS.OWNER.userId,
    title: `Monthly Audit Reminder ${runId}`,
    body: 'Financial monthly audit due next Friday.',
    type: 'RENT_DUE',
    channel: 'IN_APP',
    deduplicationKey: `owner-audit-${runId}`,
  };
  const ownerNotifRes = await request('POST', '/notifications', ownerNotifPayload, tokens.OWNER);
  assert(ownerNotifRes.status === 201, 'POST /notifications creates notification -> 201 Created');
  const ownerNotif = ownerNotifRes.data?.data || ownerNotifRes.data;
  if (ownerNotif?.id) createdNotificationIds.push(ownerNotif.id);

  const resNotifPayload = {
    userId: USERS.RESIDENT.userId,
    title: `Rent Payment Due ${runId}`,
    body: 'Your upcoming monthly rent is due on the 5th.',
    type: 'RENT_DUE',
    channel: 'IN_APP',
    deduplicationKey: `res-rent-${runId}`,
  };
  const resNotifRes = await request('POST', '/notifications', resNotifPayload, tokens.MANAGER);
  assert(resNotifRes.status === 201, 'MANAGER creates resident notification -> 201 Created');
  const resNotif = resNotifRes.data?.data || resNotifRes.data;
  if (resNotif?.id) createdNotificationIds.push(resNotif.id);

  // List notifications for OWNER
  const ownerListNotif = await request('GET', '/notifications', null, tokens.OWNER);
  assert(ownerListNotif.status === 200, 'OWNER lists notifications -> 200 OK');
  const ownerNotifs = (ownerListNotif.data?.data || ownerListNotif.data)?.items;
  assert(ownerNotifs?.some((n) => n.id === ownerNotif.id), 'OWNER finds their notification in list');

  // List notifications for RESIDENT
  const resListNotif = await request('GET', '/notifications', null, tokens.RESIDENT);
  assert(resListNotif.status === 200, 'RESIDENT lists notifications -> 200 OK');
  const resNotifs = (resListNotif.data?.data || resListNotif.data)?.items;
  assert(resNotifs?.some((n) => n.id === resNotif.id), 'RESIDENT finds their notification in list');

  // ==========================================
  // STEP 10: NOTIFICATION OWNERSHIP ISOLATION
  // ==========================================
  console.log('\n--- 10. NOTIFICATION OWNERSHIP ISOLATION ---');
  // RESIDENT must NEVER see OWNER notifications in list
  assert(!resNotifs?.some((n) => n.id === ownerNotif.id), 'RESIDENT list does NOT include OWNER notification');

  // RESIDENT accessing OWNER notification by ID -> 404
  const resAccessOwnerNotif = await request('GET', `/notifications/${ownerNotif.id}`, null, tokens.RESIDENT);
  assert(resAccessOwnerNotif.status === 404, 'RESIDENT accessing OWNER notification -> 404 Not Found');

  // OWNER accessing RESIDENT notification by ID -> 404
  const ownerAccessResNotif = await request('GET', `/notifications/${resNotif.id}`, null, tokens.OWNER);
  assert(ownerAccessResNotif.status === 404, 'OWNER accessing RESIDENT notification -> 404 Not Found');

  // RESIDENT accessing own notification by ID -> 200
  const resAccessOwnNotif = await request('GET', `/notifications/${resNotif.id}`, null, tokens.RESIDENT);
  assert(resAccessOwnNotif.status === 200, 'RESIDENT accessing own notification -> 200 OK');

  // ==========================================
  // STEP 11: MARK NOTIFICATION READ
  // ==========================================
  console.log('\n--- 11. MARK NOTIFICATION READ ---');
  const markReadRes = await request('PATCH', `/notifications/${resNotif.id}/read`, {}, tokens.RESIDENT);
  assert(markReadRes.status === 200, 'RESIDENT marks own notification as read -> 200 OK');
  const readNotif = markReadRes.data?.data || markReadRes.data;
  assert(readNotif?.status === 'READ', 'Notification status updated to READ');
  assert(readNotif?.readAt !== null, 'Notification readAt timestamp is recorded');

  // RESIDENT cannot mark OWNER notification as read
  const resMarkOwnerNotif = await request('PATCH', `/notifications/${ownerNotif.id}/read`, {}, tokens.RESIDENT);
  assert(resMarkOwnerNotif.status === 404, 'RESIDENT marking OWNER notification -> 404 Not Found');

  // ==========================================
  // STEP 12: MARK ALL READ
  // ==========================================
  console.log('\n--- 12. MARK ALL READ ---');
  // Create another unread notification for resident
  const secondNotifPayload = {
    userId: USERS.RESIDENT.userId,
    title: `Maintenance Complete Notification ${runId}`,
    body: 'Your ticket has been marked completed.',
    type: 'MAINTENANCE_CREATED',
    channel: 'IN_APP',
    deduplicationKey: `res-maint-${runId}`,
  };
  const secondNotifRes = await request('POST', '/notifications', secondNotifPayload, tokens.OWNER);
  const secondNotif = secondNotifRes.data?.data || secondNotifRes.data;
  if (secondNotif?.id) createdNotificationIds.push(secondNotif.id);

  const markAllRes = await request('PATCH', '/notifications/mark-all-read', {}, tokens.RESIDENT);
  assert(markAllRes.status === 200, 'RESIDENT marks all notifications read -> 200 OK');
  const markAllData = markAllRes.data?.data || markAllRes.data;
  assert(markAllData?.success === true, 'markAllAsRead returns success: true');

  // ==========================================
  // STEP 13: UNREAD COUNT
  // ==========================================
  console.log('\n--- 13. UNREAD COUNT ---');
  const unreadRes = await request('GET', '/notifications/unread-count', null, tokens.RESIDENT);
  assert(unreadRes.status === 200, 'GET /notifications/unread-count -> 200 OK');
  const unreadData = unreadRes.data?.data || unreadRes.data;
  assert(unreadData?.unreadCount === 0, 'Unread count is 0 after mark-all-read');

  // ==========================================
  // STEP 14: NOTIFICATION PREFERENCES
  // ==========================================
  console.log('\n--- 14. NOTIFICATION PREFERENCES ---');
  // 14.1 Get user preferences
  const getPrefsRes = await request('GET', '/notification-preferences', null, tokens.RESIDENT);
  assert(getPrefsRes.status === 200, 'RESIDENT gets notification preferences -> 200 OK');
  const prefsData = getPrefsRes.data?.data || getPrefsRes.data;
  assert(Array.isArray(prefsData?.preferences), 'Preferences returned as array');
  assert(prefsData?.preferences?.length >= 10, 'All notification types included in preferences');

  // 14.2 Update single preference
  const updateSinglePref = await request('PATCH', '/notification-preferences', {
    type: 'RENT_DUE',
    emailEnabled: false,
    whatsappEnabled: true,
  }, tokens.RESIDENT);
  assert(updateSinglePref.status === 200, 'RESIDENT updates single notification preference -> 200 OK');
  const updatedSingle = (updateSinglePref.data?.data || updateSinglePref.data)?.preferences;
  const rentDuePref = updatedSingle.find((p) => p.type === 'RENT_DUE');
  assert(rentDuePref?.emailEnabled === false, 'RENT_DUE emailEnabled is false');
  assert(rentDuePref?.whatsappEnabled === true, 'RENT_DUE whatsappEnabled is true');

  // 14.3 Update batch preferences
  const updateBatchPref = await request('PATCH', '/notification-preferences', {
    preferences: [
      { type: 'MAINTENANCE_CREATED', inAppEnabled: true, emailEnabled: false, smsEnabled: false, whatsappEnabled: false },
      { type: 'NOTICE_PUBLISHED', inAppEnabled: true, emailEnabled: true, smsEnabled: true, whatsappEnabled: true },
    ],
  }, tokens.RESIDENT);
  assert(updateBatchPref.status === 200, 'RESIDENT updates batch preferences -> 200 OK');

  // 14.4 Uniqueness verification: verify DB has exactly 1 row per (userId, type)
  const dbPrefCount = await prisma.notification_preferences.count({
    where: {
      userId: USERS.RESIDENT.userId,
      type: 'RENT_DUE',
    },
  });
  assert(dbPrefCount === 1, 'Uniqueness constraint respected: exactly 1 preference record per type in DB');

  // ==========================================
  // STEP 15: RBAC FOR ALL FIVE ROLES
  // ==========================================
  console.log('\n--- 15. RBAC FOR ALL FIVE ROLES ---');
  // Notice creation RBAC
  const testNoticePayload = {
    title: `Role Test Notice ${runId}`,
    description: 'Testing role capabilities.',
    audience: 'ALL_RESIDENTS',
    priority: 'LOW',
  };

  const rbacCreateTests = [
    { role: 'OWNER', token: tokens.OWNER, expected: 201 },
    { role: 'MANAGER', token: tokens.MANAGER, expected: 201 },
    { role: 'ACCOUNTANT', token: tokens.ACCOUNTANT, expected: 403 },
    { role: 'STAFF', token: tokens.STAFF, expected: 403 },
    { role: 'RESIDENT', token: tokens.RESIDENT, expected: 403 },
  ];

  for (const t of rbacCreateTests) {
    const res = await request('POST', '/notices', testNoticePayload, t.token);
    assert(res.status === t.expected, `${t.role} notice creation expected ${t.expected}, got ${res.status}`);
    if (res.status === 201 && res.data?.data?.id) {
      createdNoticeIds.push(res.data.data.id);
    }
  }

  // Notice reading RBAC (All 5 roles have property.read)
  for (const role of Object.keys(tokens)) {
    const res = await request('GET', '/notices', null, tokens[role]);
    assert(res.status === 200, `${role} can read notices (200 OK)`);
  }

  // Notifications access RBAC (All 5 roles can access their own notifications)
  for (const role of Object.keys(tokens)) {
    const res = await request('GET', '/notifications', null, tokens[role]);
    assert(res.status === 200, `${role} can list own notifications (200 OK)`);
  }

  // Notification preferences access RBAC (All 5 roles can access their preferences)
  for (const role of Object.keys(tokens)) {
    const res = await request('GET', '/notification-preferences', null, tokens[role]);
    assert(res.status === 200, `${role} can get notification preferences (200 OK)`);
  }

  // ==========================================
  // STEP 16: ORGANIZATION ISOLATION
  // ==========================================
  console.log('\n--- 16. ORGANIZATION ISOLATION ---');
  const nonMemberOrgNotices = await request('GET', '/notices', null, tokens.OWNER, CROSS_ORG_ID);
  assert(nonMemberOrgNotices.status === 403, 'Non-member organization header -> 403 Forbidden');

  const nonMemberOrgNotifs = await request('GET', '/notifications', null, tokens.OWNER, CROSS_ORG_ID);
  assert(nonMemberOrgNotifs.status === 403, 'Non-member organization header for notifications -> 403 Forbidden');

  const nonMemberOrgPrefs = await request('GET', '/notification-preferences', null, tokens.OWNER, CROSS_ORG_ID);
  assert(nonMemberOrgPrefs.status === 403, 'Non-member organization header for preferences -> 403 Forbidden');

  // ==========================================
  // STEP 17: CROSS-PROPERTY ISOLATION
  // ==========================================
  console.log('\n--- 17. CROSS-PROPERTY ISOLATION ---');
  const crossPropNotice = await request('POST', '/notices', {
    title: 'Cross Property Notice',
    description: 'Testing cross property',
    propertyId: CROSS_ORG_ID,
  }, tokens.OWNER);
  assert(crossPropNotice.status === 404, 'Notice with cross-org property -> 404 Not Found');

  const crossPropNotif = await request('POST', '/notifications', {
    userId: USERS.OWNER.userId,
    title: 'Cross Property Notif',
    body: 'Testing cross property',
    type: 'RENT_DUE',
    propertyId: CROSS_ORG_ID,
  }, tokens.OWNER);
  assert(crossPropNotif.status === 404, 'Notification with cross-org property -> 404 Not Found');

  // ==========================================
  // STEP 18: INVALID UUIDS
  // ==========================================
  console.log('\n--- 18. INVALID UUIDS ---');
  const invalidNoticeUuid = await request('GET', '/notices/invalid-uuid-1234', null, tokens.OWNER);
  assert(invalidNoticeUuid.status === 400, 'Invalid notice UUID param -> 400 Bad Request');

  const invalidNotifUuid = await request('GET', '/notifications/invalid-uuid-1234', null, tokens.OWNER);
  assert(invalidNotifUuid.status === 400, 'Invalid notification UUID param -> 400 Bad Request');

  const invalidOrgHeader = await request('GET', '/notices', null, tokens.OWNER, 'not-a-valid-uuid');
  assert(invalidOrgHeader.status === 400, 'Invalid X-Organization-Id header -> 400 Bad Request');

  // ==========================================
  // STEP 19: MISSING JWT
  // ==========================================
  console.log('\n--- 19. MISSING JWT ---');
  const noJwtNotice = await request('GET', '/notices', null, null);
  assert(noJwtNotice.status === 401, 'Missing JWT on /notices -> 401 Unauthorized');

  const noJwtNotifs = await request('GET', '/notifications', null, null);
  assert(noJwtNotifs.status === 401, 'Missing JWT on /notifications -> 401 Unauthorized');

  const noJwtPrefs = await request('GET', '/notification-preferences', null, null);
  assert(noJwtPrefs.status === 401, 'Missing JWT on /notification-preferences -> 401 Unauthorized');

  // ==========================================
  // STEP 20: MISSING ORGANIZATION HEADER
  // ==========================================
  console.log('\n--- 20. MISSING ORGANIZATION HEADER ---');
  const noOrgNotice = await request('GET', '/notices', null, tokens.OWNER, null);
  assert(noOrgNotice.status === 400, 'Missing X-Organization-Id on /notices -> 400 Bad Request');

  const noOrgNotifs = await request('GET', '/notifications', null, tokens.OWNER, null);
  assert(noOrgNotifs.status === 400, 'Missing X-Organization-Id on /notifications -> 400 Bad Request');

  const noOrgPrefs = await request('GET', '/notification-preferences', null, tokens.OWNER, null);
  assert(noOrgPrefs.status === 400, 'Missing X-Organization-Id on /notification-preferences -> 400 Bad Request');

  // ==========================================
  // STEP 21: AUDIT LOGS
  // ==========================================
  console.log('\n--- 21. AUDIT LOGS ---');
  const auditLogs = await prisma.audit_logs.findMany({
    where: {
      organizationId: ORG_ID,
      entityType: { in: ['notices', 'notifications', 'notification_preferences'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const actions = auditLogs.map((l) => l.action);
  console.log('  Audit log actions recorded:', actions);
  assert(actions.includes('notice.created'), 'Audit log contains notice.created');
  assert(actions.includes('notice.updated'), 'Audit log contains notice.updated');
  assert(actions.includes('notice.published'), 'Audit log contains notice.published');
  assert(actions.includes('notice.archived'), 'Audit log contains notice.archived');
  assert(actions.includes('notification.created'), 'Audit log contains notification.created');
  assert(actions.includes('notification_preferences.updated'), 'Audit log contains notification_preferences.updated');

  // ==========================================
  // STEP 22: TRANSACTION INTEGRITY
  // ==========================================
  console.log('\n--- 22. TRANSACTION INTEGRITY ---');
  // Attempt invalid notice creation (violating property lookup or constraints)
  const failedNoticeRes = await request('POST', '/notices', {
    title: 'Failing notice',
    description: 'This will fail',
    propertyId: CROSS_ORG_ID, // Non-existent property in this org
  }, tokens.OWNER);
  assert(failedNoticeRes.status === 404, 'Transaction rejected before partial commit');

  // Verify no orphan audit log was recorded for the failed notice
  const orphanAudit = await prisma.audit_logs.findFirst({
    where: {
      action: 'notice.created',
      newValues: { contains: 'Failing notice' },
    },
  });
  assert(!orphanAudit, 'No orphan audit log found from failed transaction');

  // ==========================================
  // STEP 23: NO UNAUTHORIZED USER ACCESS
  // ==========================================
  console.log('\n--- 23. NO UNAUTHORIZED USER ACCESS ---');
  // Attempt creating notification with arbitrary un-joined user -> 404
  const unauthRecipient = await request('POST', '/notifications', {
    userId: CROSS_ORG_ID,
    title: 'Hacked Notif',
    body: 'Recipient is not in org',
    type: 'RENT_DUE',
  }, tokens.OWNER);
  assert(unauthRecipient.status === 404, 'Cannot create notification for unauthorized user not in org -> 404 Not Found');

  // ==========================================
  // CLEANUP TEST ARTIFACTS
  // ==========================================
  console.log('\n--- CLEANUP TEST ARTIFACTS ---');
  if (createdNoticeIds.length > 0) {
    await prisma.notices.deleteMany({
      where: { id: { in: createdNoticeIds } },
    });
    console.log(`  Cleaned up ${createdNoticeIds.length} test notices`);
  }

  if (createdNotificationIds.length > 0) {
    await prisma.notifications.deleteMany({
      where: { id: { in: createdNotificationIds } },
    });
    console.log(`  Cleaned up ${createdNotificationIds.length} test notifications`);
  }

  // Safe cleanup: Do NOT wipe resident notification preferences
  const allCreatedP12Ids = [...createdNoticeIds, ...createdNotificationIds];
  if (allCreatedP12Ids.length > 0) {
    await prisma.audit_logs.deleteMany({
      where: {
        organizationId: ORG_ID,
        entityId: { in: allCreatedP12Ids },
      },
    });
    console.log('  Cleaned up audit logs scoped to created notice/notification IDs');
  }

  console.log('\n=============================================');
  console.log(`PHASE 12 TEST RESULTS:`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  TOTAL : ${passed + failed}`);
  console.log('=============================================');

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
