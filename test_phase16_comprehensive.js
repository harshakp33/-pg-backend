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
  console.log('PHASE 16 — REPORTS & ANALYTICS COMPREHENSIVE TEST SUITE');
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
  // SECTION B — Dashboard
  // ----------------------------------------------------
  console.log('\n--- SECTION B: Dashboard Report ---');
  const dashRes = await request('GET', '/reports/dashboard', null, tokens.OWNER);
  assert(dashRes.status === 200, 'GET /reports/dashboard returns 200 OK for OWNER');
  const dash = dashRes.data?.data || {};
  assert(dash.properties && typeof dash.properties.totalProperties === 'number', 'Dashboard returns properties metrics');
  assert(dash.occupancy && typeof dash.occupancy.occupancyPercentage === 'number', 'Dashboard returns occupancy metrics');
  assert(dash.financials && typeof dash.financials.totalInvoiced === 'number', 'Dashboard returns financials metrics');
  assert(dash.financials && dash.financials.netOperatingIncome === dash.financials.totalCollected - dash.financials.totalExpenses, 'Dashboard net operating income correctly calculated');
  assert(dash.operations && typeof dash.operations.openComplaints === 'number', 'Dashboard returns operations metrics');
  assert(dash.bookings && typeof dash.bookings.enquiriesCount === 'number', 'Dashboard returns bookings metrics');

  const dashPropRes = await request('GET', `/reports/dashboard?propertyId=${PROPERTY_ID}`, null, tokens.OWNER);
  assert(dashPropRes.status === 200, 'Dashboard supports propertyId filter');
  assert(dashPropRes.data?.data?.properties?.totalProperties === 1, 'Dashboard propertyId filter scopes properties count to 1');

  // ----------------------------------------------------
  // SECTION C — Occupancy Report
  // ----------------------------------------------------
  console.log('\n--- SECTION C: Occupancy Report ---');
  const occRes = await request('GET', '/reports/occupancy', null, tokens.OWNER);
  assert(occRes.status === 200, 'GET /reports/occupancy returns 200 OK');
  const occ = occRes.data?.data || {};
  assert(occ.summary && typeof occ.summary.totalBeds === 'number', 'Occupancy summary contains totalBeds');
  assert(typeof occ.summary.occupiedBeds === 'number', 'Occupancy summary contains occupiedBeds');
  assert(typeof occ.summary.availableBeds === 'number', 'Occupancy summary contains availableBeds');
  const occPct = occ.summary.totalBeds > 0 ? Number(((occ.summary.occupiedBeds / occ.summary.totalBeds) * 100).toFixed(2)) : 0;
  assert(occ.summary.occupancyPercentage === occPct, 'Occupancy percentage matches mathematical formula');
  assert(Array.isArray(occ.byProperty), 'Occupancy contains byProperty breakdown array');
  assert(Array.isArray(occ.byRoomType), 'Occupancy contains byRoomType breakdown array');
  assert(occ.meta && occ.meta.page === 1, 'Occupancy pagination meta exists');

  const occPropRes = await request('GET', `/reports/occupancy?propertyId=${PROPERTY_ID}`, null, tokens.OWNER);
  assert(occPropRes.status === 200, 'Occupancy supports propertyId filter');
  assert(occPropRes.data?.data?.byProperty?.length <= 1, 'Occupancy property filter returns at most 1 property item');

  // ----------------------------------------------------
  // SECTION D — Properties Report
  // ----------------------------------------------------
  console.log('\n--- SECTION D: Properties Report ---');
  const propsRes = await request('GET', '/reports/properties', null, tokens.OWNER);
  assert(propsRes.status === 200, 'GET /reports/properties returns 200 OK');
  const pData = propsRes.data?.data || {};
  assert(Array.isArray(pData.items), 'Properties report contains items array');
  if (pData.items.length > 0) {
    const p0 = pData.items[0];
    assert(Boolean(p0.propertyId && p0.propertyName), 'Property item has propertyId and propertyName');
    assert(typeof p0.totalRooms === 'number' && typeof p0.totalBeds === 'number', 'Property item has room and bed counts');
    assert(typeof p0.occupancyPercentage === 'number', 'Property item has numeric occupancyPercentage');
    assert(typeof p0.totalInvoiced === 'number' && typeof p0.totalCollected === 'number', 'Property item has invoiced and collected metrics');
  }
  assert(pData.meta && typeof pData.meta.total === 'number', 'Properties report includes pagination metadata');

  // ----------------------------------------------------
  // SECTION E — Revenue Report
  // ----------------------------------------------------
  console.log('\n--- SECTION E: Revenue Report ---');
  const revRes = await request('GET', '/reports/revenue', null, tokens.OWNER);
  assert(revRes.status === 200, 'GET /reports/revenue returns 200 OK');
  const rev = revRes.data?.data || {};
  assert(typeof rev.summary?.totalInvoiced === 'number', 'Revenue summary has totalInvoiced');
  assert(typeof rev.summary?.totalCollected === 'number', 'Revenue summary has totalCollected');
  assert(typeof rev.summary?.totalOutstanding === 'number', 'Revenue summary has totalOutstanding');
  assert(typeof rev.summary?.collectionRate === 'number', 'Revenue summary has collectionRate');
  assert(Array.isArray(rev.timeline), 'Revenue report has timeline array');

  const revMonthRes = await request('GET', '/reports/revenue?groupBy=month', null, tokens.OWNER);
  assert(revMonthRes.status === 200, 'Revenue supports groupBy=month');
  const revDayRes = await request('GET', '/reports/revenue?groupBy=day', null, tokens.OWNER);
  assert(revDayRes.status === 200, 'Revenue supports groupBy=day');

  // ----------------------------------------------------
  // SECTION F — Collections Report
  // ----------------------------------------------------
  console.log('\n--- SECTION F: Collections Report ---');
  const colRes = await request('GET', '/reports/collections', null, tokens.OWNER);
  assert(colRes.status === 200, 'GET /reports/collections returns 200 OK');
  const col = colRes.data?.data || {};
  assert(typeof col.summary?.totalCollected === 'number', 'Collections summary has totalCollected');
  assert(typeof col.summary?.paymentCount === 'number', 'Collections summary has paymentCount');
  assert(typeof col.summary?.averagePaymentAmount === 'number', 'Collections summary has averagePaymentAmount');
  assert(Array.isArray(col.byPaymentMethod), 'Collections has byPaymentMethod array');
  assert(Array.isArray(col.byProperty), 'Collections has byProperty array');

  // ----------------------------------------------------
  // SECTION G — Outstanding / Receivables Report
  // ----------------------------------------------------
  console.log('\n--- SECTION G: Outstanding Report ---');
  const outRes = await request('GET', '/reports/outstanding', null, tokens.OWNER);
  assert(outRes.status === 200, 'GET /reports/outstanding returns 200 OK');
  const out = outRes.data?.data || {};
  assert(typeof out.summary?.totalOutstanding === 'number', 'Outstanding summary has totalOutstanding');
  assert(typeof out.summary?.totalOverdue === 'number', 'Outstanding summary has totalOverdue');
  assert(typeof out.summary?.unpaidInvoiceCount === 'number', 'Outstanding summary has unpaidInvoiceCount');
  assert(out.aging && typeof out.aging.current === 'number', 'Outstanding report has aging breakdown (current)');
  assert(typeof out.aging.days1to30 === 'number', 'Outstanding report has aging breakdown (days1to30)');
  assert(Array.isArray(out.byProperty), 'Outstanding report has byProperty breakdown');
  assert(Array.isArray(out.topDebtors), 'Outstanding report has topDebtors array');

  // ----------------------------------------------------
  // SECTION H — Expenses Report
  // ----------------------------------------------------
  console.log('\n--- SECTION H: Expenses Report ---');
  const expRes = await request('GET', '/reports/expenses', null, tokens.OWNER);
  assert(expRes.status === 200, 'GET /reports/expenses returns 200 OK');
  const exp = expRes.data?.data || {};
  assert(typeof exp.summary?.totalExpenses === 'number', 'Expenses summary has totalExpenses');
  assert(typeof exp.summary?.generalExpensesTotal === 'number', 'Expenses summary has generalExpensesTotal');
  assert(typeof exp.summary?.foodExpensesTotal === 'number', 'Expenses summary has foodExpensesTotal');
  assert(exp.summary?.totalExpenses === exp.summary?.generalExpensesTotal + exp.summary?.foodExpensesTotal, 'totalExpenses equals general + food expenses');
  assert(Array.isArray(exp.byCategory), 'Expenses has byCategory array');
  assert(Array.isArray(exp.byProperty), 'Expenses has byProperty array');

  const expCatRes = await request('GET', '/reports/expenses?category=FOOD_GROCERY', null, tokens.OWNER);
  assert(expCatRes.status === 200, 'Expenses supports category filter');

  // ----------------------------------------------------
  // SECTION I — Residents Report
  // ----------------------------------------------------
  console.log('\n--- SECTION I: Residents Report ---');
  const resRes = await request('GET', '/reports/residents', null, tokens.OWNER);
  assert(resRes.status === 200, 'GET /reports/residents returns 200 OK');
  const rpt = resRes.data?.data || {};
  assert(typeof rpt.summary?.totalResidents === 'number', 'Residents summary has totalResidents');
  assert(typeof rpt.summary?.activeResidents === 'number', 'Residents summary has activeResidents');
  assert(Array.isArray(rpt.byStatus), 'Residents report has byStatus array');
  assert(Array.isArray(rpt.byGender), 'Residents report has byGender array');
  assert(Array.isArray(rpt.byOccupation), 'Residents report has byOccupation array');
  assert(Array.isArray(rpt.byProperty), 'Residents report has byProperty array');

  const resFilter = await request('GET', '/reports/residents?status=ACTIVE', null, tokens.OWNER);
  assert(resFilter.status === 200, 'Residents supports status filter');

  // ----------------------------------------------------
  // SECTION J — Bookings Report
  // ----------------------------------------------------
  console.log('\n--- SECTION J: Bookings Report ---');
  const bkgRes = await request('GET', '/reports/bookings', null, tokens.OWNER);
  assert(bkgRes.status === 200, 'GET /reports/bookings returns 200 OK');
  const bkg = bkgRes.data?.data || {};
  assert(typeof bkg.summary?.enquiriesCount === 'number', 'Bookings summary has enquiriesCount');
  assert(typeof bkg.summary?.bookingsCount === 'number', 'Bookings summary has bookingsCount');
  assert(typeof bkg.summary?.enquiryToBookingRate === 'number', 'Bookings summary has enquiryToBookingRate');
  assert(typeof bkg.summary?.bookingConversionRate === 'number', 'Bookings summary has bookingConversionRate');
  assert(!isNaN(bkg.summary?.enquiryToBookingRate), 'enquiryToBookingRate is not NaN');
  assert(!isNaN(bkg.summary?.bookingConversionRate), 'bookingConversionRate is not NaN');
  assert(Array.isArray(bkg.byEnquirySource), 'Bookings has byEnquirySource breakdown');
  assert(Array.isArray(bkg.byProperty), 'Bookings has byProperty breakdown');

  // ----------------------------------------------------
  // SECTION K — Operations Report
  // ----------------------------------------------------
  console.log('\n--- SECTION K: Operations Report ---');
  const opsRes = await request('GET', '/reports/operations', null, tokens.OWNER);
  assert(opsRes.status === 200, 'GET /reports/operations returns 200 OK');
  const ops = opsRes.data?.data || {};
  assert(ops.complaints && typeof ops.complaints.total === 'number', 'Operations has complaints total');
  assert(typeof ops.complaints.open === 'number', 'Operations has complaints open count');
  assert(Array.isArray(ops.complaints.byCategory), 'Complaints has byCategory breakdown');
  assert(ops.maintenance && typeof ops.maintenance.total === 'number', 'Operations has maintenance total');
  assert(typeof ops.maintenance.totalEstimatedCost === 'number', 'Maintenance has totalEstimatedCost');
  assert(ops.staffTasks && typeof ops.staffTasks.total === 'number', 'Operations has staffTasks total');
  assert(typeof ops.staffTasks.pending === 'number', 'Staff tasks has pending count');

  // ----------------------------------------------------
  // SECTION L — Staff Report
  // ----------------------------------------------------
  console.log('\n--- SECTION L: Staff Report ---');
  const stfRes = await request('GET', '/reports/staff', null, tokens.OWNER);
  assert(stfRes.status === 200, 'GET /reports/staff returns 200 OK');
  const stf = stfRes.data?.data || {};
  assert(typeof stf.summary?.totalStaff === 'number', 'Staff summary has totalStaff');
  assert(typeof stf.summary?.activeStaff === 'number', 'Staff summary has activeStaff');
  assert(Array.isArray(stf.byShift), 'Staff has byShift breakdown');
  assert(Array.isArray(stf.byProperty), 'Staff has byProperty breakdown');
  assert(stf.attendance && typeof stf.attendance.totalRecords === 'number', 'Staff has attendance totalRecords');
  assert(typeof stf.attendance.attendanceRate === 'number', 'Staff has attendanceRate');

  // ----------------------------------------------------
  // SECTION M — Food & Mess Report
  // ----------------------------------------------------
  console.log('\n--- SECTION M: Food Report ---');
  const foodRes = await request('GET', '/reports/food', null, tokens.OWNER);
  assert(foodRes.status === 200, 'GET /reports/food returns 200 OK');
  const food = foodRes.data?.data || {};
  assert(food.meals && typeof food.meals.totalMealRecords === 'number', 'Food has meals totalMealRecords');
  assert(typeof food.meals.consumptionRate === 'number', 'Food has consumptionRate');
  assert(Array.isArray(food.meals.byMealType), 'Food has byMealType array');
  assert(food.attendance && typeof food.attendance.totalAttendanceLogged === 'number', 'Food has attendance total');
  assert(food.finances && typeof food.finances.totalFoodExpenses === 'number', 'Food has totalFoodExpenses');
  assert(food.inventory && typeof food.inventory.totalInventoryItems === 'number', 'Food has totalInventoryItems');

  // ----------------------------------------------------
  // SECTION N — Visitors Report
  // ----------------------------------------------------
  console.log('\n--- SECTION N: Visitors Report ---');
  const visRes = await request('GET', '/reports/visitors', null, tokens.OWNER);
  assert(visRes.status === 200, 'GET /reports/visitors returns 200 OK');
  const vis = visRes.data?.data || {};
  assert(typeof vis.summary?.totalVisitors === 'number', 'Visitors summary has totalVisitors');
  assert(typeof vis.summary?.checkedIn === 'number', 'Visitors summary has checkedIn');
  assert(Array.isArray(vis.byPurpose), 'Visitors has byPurpose breakdown');
  assert(Array.isArray(vis.byProperty), 'Visitors has byProperty breakdown');

  // ----------------------------------------------------
  // SECTION O — Leaves Report
  // ----------------------------------------------------
  console.log('\n--- SECTION O: Leaves Report ---');
  const leaveRes = await request('GET', '/reports/leaves', null, tokens.OWNER);
  assert(leaveRes.status === 200, 'GET /reports/leaves returns 200 OK');
  const lve = leaveRes.data?.data || {};
  assert(typeof lve.summary?.totalLeaves === 'number', 'Leaves summary has totalLeaves');
  assert(typeof lve.summary?.pending === 'number', 'Leaves summary has pending count');
  assert(typeof lve.summary?.approvalRate === 'number', 'Leaves summary has approvalRate');
  assert(Array.isArray(lve.byProperty), 'Leaves has byProperty breakdown');

  // ----------------------------------------------------
  // SECTION P — Validation
  // ----------------------------------------------------
  console.log('\n--- SECTION P: Validation & Parameter Rejection ---');
  const badUuid = await request('GET', '/reports/occupancy?propertyId=invalid-uuid', null, tokens.OWNER);
  assert(badUuid.status === 400, 'Invalid UUID for propertyId returns 400');

  const badDate = await request('GET', '/reports/revenue?startDate=not-a-date', null, tokens.OWNER);
  assert(badDate.status === 400, 'Invalid date string returns 400');

  const revDateOrder = await request('GET', '/reports/revenue?startDate=2026-12-31&endDate=2026-01-01', null, tokens.OWNER);
  assert(revDateOrder.status === 400, 'startDate > endDate returns 400 Bad Request');

  const badGroup = await request('GET', '/reports/revenue?groupBy=yearly', null, tokens.OWNER);
  assert(badGroup.status === 400, 'Invalid groupBy returns 400');

  const badPage = await request('GET', '/reports/properties?page=0', null, tokens.OWNER);
  assert(badPage.status === 400, 'Page < 1 returns 400');

  const badLimit = await request('GET', '/reports/properties?limit=150', null, tokens.OWNER);
  assert(badLimit.status === 400, 'Limit > 100 returns 400');

  const unknownParam = await request('GET', '/reports/dashboard?maliciousPayload=injection', null, tokens.OWNER);
  assert(unknownParam.status === 400, 'Unknown query parameters rejected with 400 Bad Request');

  // ----------------------------------------------------
  // SECTION Q — RBAC Matrix
  // ----------------------------------------------------
  console.log('\n--- SECTION Q: Role-Based Access Control (RBAC) ---');
  const mgrRes = await request('GET', '/reports/operations', null, tokens.MANAGER);
  assert(mgrRes.status === 200, 'MANAGER can access operations report (200)');

  const mgrDash = await request('GET', '/reports/dashboard', null, tokens.MANAGER);
  assert(mgrDash.status === 200, 'MANAGER can access dashboard (200)');

  const acctRev = await request('GET', '/reports/revenue', null, tokens.ACCOUNTANT);
  assert(acctRev.status === 200, 'ACCOUNTANT can access revenue report (200)');

  const acctCol = await request('GET', '/reports/collections', null, tokens.ACCOUNTANT);
  assert(acctCol.status === 200, 'ACCOUNTANT can access collections report (200)');

  const acctExp = await request('GET', '/reports/expenses', null, tokens.ACCOUNTANT);
  assert(acctExp.status === 200, 'ACCOUNTANT can access expenses report (200)');

  const acctOut = await request('GET', '/reports/outstanding', null, tokens.ACCOUNTANT);
  assert(acctOut.status === 200, 'ACCOUNTANT can access outstanding report (200)');

  const acctOps = await request('GET', '/reports/operations', null, tokens.ACCOUNTANT);
  assert(acctOps.status === 403, 'ACCOUNTANT is forbidden from operations report (403)');

  const acctStaff = await request('GET', '/reports/staff', null, tokens.ACCOUNTANT);
  assert(acctStaff.status === 403, 'ACCOUNTANT is forbidden from staff report (403)');

  const acctVis = await request('GET', '/reports/visitors', null, tokens.ACCOUNTANT);
  assert(acctVis.status === 403, 'ACCOUNTANT is forbidden from visitors report (403)');

  const acctLeave = await request('GET', '/reports/leaves', null, tokens.ACCOUNTANT);
  assert(acctLeave.status === 403, 'ACCOUNTANT is forbidden from leaves report (403)');

  const staffDash = await request('GET', '/reports/dashboard', null, tokens.STAFF);
  assert(staffDash.status === 403, 'STAFF is forbidden from dashboard (403)');

  const resDash = await request('GET', '/reports/dashboard', null, tokens.RESIDENT);
  assert(resDash.status === 403, 'RESIDENT is forbidden from dashboard (403)');

  // ----------------------------------------------------
  // SECTION R — Organization Isolation
  // ----------------------------------------------------
  console.log('\n--- SECTION R: Organization Isolation ---');
  const noOrg = await request('GET', '/reports/dashboard', null, tokens.OWNER, null);
  assert(noOrg.status === 400, 'Missing X-Organization-Id returns 400 Bad Request');

  const badOrg = await request('GET', '/reports/dashboard', null, tokens.OWNER, 'not-a-uuid');
  assert(badOrg.status === 400, 'Invalid X-Organization-Id returns 400 Bad Request');

  const crossOrg = await request('GET', '/reports/dashboard', null, tokens.OWNER, CROSS_ORG_ID);
  assert(crossOrg.status === 403, 'Non-member organization header returns 403 Forbidden');

  // ----------------------------------------------------
  // SECTION S — Property Isolation
  // ----------------------------------------------------
  console.log('\n--- SECTION S: Property Isolation ---');
  const foreignProp = await request('GET', `/reports/occupancy?propertyId=${NON_EXISTENT_PROPERTY_ID}`, null, tokens.OWNER);
  assert(foreignProp.status === 404, 'Foreign or non-existent propertyId returns 404 Not Found');

  // ----------------------------------------------------
  // SECTION T — Data Accuracy Verification (Direct SQL vs API)
  // ----------------------------------------------------
  console.log('\n--- SECTION T: Direct Database Accuracy Verification ---');
  const dbProps = await prisma.properties.count({ where: { organizationId: ORG_ID, deletedAt: null } });
  assert(dash.properties?.totalProperties === dbProps, `API totalProperties (${dash.properties?.totalProperties}) === DB count (${dbProps})`);

  const dbBeds = await prisma.beds.count({ where: { organizationId: ORG_ID, deletedAt: null } });
  assert(dash.occupancy?.totalBeds === dbBeds, `API totalBeds (${dash.occupancy?.totalBeds}) === DB count (${dbBeds})`);

  const dbOccupied = await prisma.beds.count({ where: { organizationId: ORG_ID, deletedAt: null, status: 'OCCUPIED' } });
  assert(dash.occupancy?.occupiedBeds === dbOccupied, `API occupiedBeds (${dash.occupancy?.occupiedBeds}) === DB count (${dbOccupied})`);

  const dbPayments = await prisma.payments.aggregate({
    where: { organizationId: ORG_ID, status: { in: ['RECORDED', 'VERIFIED'] }, deletedAt: null },
    _sum: { amount: true },
  });
  const dbPayTotal = Number(dbPayments._sum.amount || 0);
  assert(dash.financials?.totalCollected === dbPayTotal, `API totalCollected (${dash.financials?.totalCollected}) === DB sum (${dbPayTotal})`);

  const dbInvoices = await prisma.invoices.aggregate({
    where: { organizationId: ORG_ID, status: { notIn: ['CANCELLED', 'DRAFT'] } },
    _sum: { netPayable: true },
  });
  const dbInvTotal = Number(dbInvoices._sum.netPayable || 0);
  assert(dash.financials?.totalInvoiced === dbInvTotal, `API totalInvoiced (${dash.financials?.totalInvoiced}) === DB sum (${dbInvTotal})`);

  const dbFood = await prisma.food_expenses.aggregate({
    where: { organizationId: ORG_ID },
    _sum: { amount: true },
  });
  const dbFoodTotal = Number(dbFood._sum.amount || 0);
  assert(dash.financials?.totalFoodExpenses === dbFoodTotal, `API totalFoodExpenses (${dash.financials?.totalFoodExpenses}) === DB sum (${dbFoodTotal})`);

  // ----------------------------------------------------
  // SECTION U — Security & Sensitive Data Leak Prevention
  // ----------------------------------------------------
  console.log('\n--- SECTION U: Security & Data Leak Prevention ---');
  const rawJson = JSON.stringify(dashRes.data) + JSON.stringify(resRes.data) + JSON.stringify(stfRes.data) + JSON.stringify(visRes.data);
  assert(!rawJson.includes('passwordHash'), 'No passwordHash in any report response');
  assert(!rawJson.includes('refreshToken'), 'No refreshToken in any report response');
  assert(!rawJson.includes('DATABASE_URL'), 'No database connection strings exposed');
  assert(!rawJson.includes('idProofNumber'), 'No ID proof numbers exposed in reports');

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`TOTAL ASSERTIONS: ${passed + failed}`);
  console.log(`PASSED:           ${passed}`);
  console.log(`FAILED:           ${failed}`);
  console.log('====================================================\n');

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(async (e) => {
  console.error('Test execution failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
