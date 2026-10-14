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
const OTHER_RESIDENT_ID = '00499de1-5cf5-4051-b57c-ec705938746f'; // Rohan Gupta

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
  console.log('=== STARTING PHASE 11 COMPREHENSIVE TEST SUITE ===\n');

  // Dynamic values to guarantee test run isolation
  const randomDays = Math.floor(Math.random() * 5000) + 100;
  const testDateObj = new Date(Date.now() + 86400000 * randomDays);
  const weekStart = testDateObj.toISOString().slice(0, 10);
  const mealDate = testDateObj.toISOString().slice(0, 10);
  const runId = Date.now().toString().slice(-6);

  // STEP 1: AUTHENTICATION TOKENS
  console.log('--- STEP 1: AUTHENTICATION VERIFICATION ---');
  for (const role of Object.keys(tokens)) {
    assert(!!tokens[role], `${role} JWT signed successfully`);
  }

  // STEP 2: WEEKLY MENUS
  console.log('\n--- STEP 2: WEEKLY MENUS ---');
  let createdWeeklyMenuId = '';
  const menuPayload = {
    propertyId: PROPERTY_ID,
    name: `South Indian Weekly Special ${runId}`,
    weekStartDate: weekStart,
    isPublished: true,
    notes: 'Includes festive sweets on Friday',
    items: [
      {
        dayOfWeek: 'MONDAY',
        mealType: 'BREAKFAST',
        title: 'Idli & Sambar',
        itemsDescription: 'Steamed rice idlis with piping hot sambar & coconut chutney',
        startTime: '07:30',
        endTime: '09:30',
        isSpecialMeal: false,
      },
    ],
  };

  const createMenuRes = await request('POST', '/food/weekly-menus', menuPayload, tokens.OWNER);
  assert(createMenuRes.status === 201, 'POST /food/weekly-menus creates menu (201)');
  assert(createMenuRes.data?.data?.name === `South Indian Weekly Special ${runId}`, 'Created weekly menu has correct name');
  assert(createMenuRes.data?.data?.daily_menu_items?.length === 1, 'Initial daily menu item created atomically with weekly menu');
  createdWeeklyMenuId = createMenuRes.data?.data?.id;

  // Duplicate week menu check
  const dupMenuRes = await request('POST', '/food/weekly-menus', menuPayload, tokens.OWNER);
  assert(dupMenuRes.status === 400, 'Duplicate weekly menu for same property and week start rejected (400)');

  // List menus
  const listMenusRes = await request('GET', '/food/weekly-menus?page=1&limit=10', null, tokens.RESIDENT);
  assert(listMenusRes.status === 200, 'GET /food/weekly-menus lists menus for resident (200)');
  assert(Array.isArray(listMenusRes.data?.data?.items), 'Returned menus items array');
  assert(listMenusRes.data?.data?.meta?.total >= 1, 'Pagination meta total >= 1');

  // Get single menu
  const getMenuRes = await request('GET', `/food/weekly-menus/${createdWeeklyMenuId}`, null, tokens.RESIDENT);
  assert(getMenuRes.status === 200, 'GET /food/weekly-menus/:id returns menu details (200)');
  assert(getMenuRes.data?.data?.id === createdWeeklyMenuId, 'Returned correct weekly menu ID');

  // Update weekly menu
  const updateMenuRes = await request('PATCH', `/food/weekly-menus/${createdWeeklyMenuId}`, { notes: 'Updated notes with holiday schedule' }, tokens.MANAGER);
  assert(updateMenuRes.status === 200, 'PATCH /food/weekly-menus/:id updates menu (200)');
  assert(updateMenuRes.data?.data?.notes === 'Updated notes with holiday schedule', 'Updated notes verified');

  // STEP 3: DAILY MENU ITEMS
  console.log('\n--- STEP 3: DAILY MENU ITEMS ---');
  let createdMenuItemId = '';
  const itemPayload = {
    weeklyMenuId: createdWeeklyMenuId,
    dayOfWeek: 'TUESDAY',
    mealType: 'LUNCH',
    title: 'Veg Thali Deluxe',
    itemsDescription: 'Rice, Dal Fry, Paneer Butter Masala, Roti, Salad, Gulab Jamun',
    startTime: '12:30',
    endTime: '14:30',
    isSpecialMeal: true,
  };

  const createItemRes = await request('POST', '/food/menu-items', itemPayload, tokens.MANAGER);
  assert(createItemRes.status === 201, 'POST /food/menu-items creates menu item (201)');
  assert(createItemRes.data?.data?.title === 'Veg Thali Deluxe', 'Created menu item title verified');
  createdMenuItemId = createItemRes.data?.data?.id;

  // List menu items
  const listItemsRes = await request('GET', `/food/menu-items?weeklyMenuId=${createdWeeklyMenuId}`, null, tokens.RESIDENT);
  assert(listItemsRes.status === 200, 'GET /food/menu-items lists items for menu (200)');
  assert(listItemsRes.data?.data?.items?.length >= 2, 'Menu items count >= 2');

  // Update menu item
  const updateItemRes = await request('PATCH', `/food/menu-items/${createdMenuItemId}`, { title: 'Royal Veg Thali' }, tokens.MANAGER);
  assert(updateItemRes.status === 200, 'PATCH /food/menu-items/:id updates item (200)');
  assert(updateItemRes.data?.data?.title === 'Royal Veg Thali', 'Updated menu item title verified');

  // STEP 4: MEAL RECORDS
  console.log('\n--- STEP 4: MEAL RECORDS ---');
  let createdMealId = '';
  const mealPayload = {
    propertyId: PROPERTY_ID,
    mealDate,
    mealType: 'LUNCH',
    expectedCount: 50,
    actualCount: 0,
    notes: 'Regular lunch service',
  };

  const createMealRes = await request('POST', '/food/meals', mealPayload, tokens.STAFF);
  assert(createMealRes.status === 201, 'POST /food/meals creates meal record by STAFF (201)');
  assert(createMealRes.data?.data?.mealType === 'LUNCH', 'Created meal type verified');
  createdMealId = createMealRes.data?.data?.id;

  // Duplicate meal record rejection
  const dupMealRes = await request('POST', '/food/meals', mealPayload, tokens.STAFF);
  assert(dupMealRes.status === 400, 'Duplicate meal record for same property, date, and mealType rejected (400)');

  // List meals
  const listMealsRes = await request('GET', `/food/meals?propertyId=${PROPERTY_ID}`, null, tokens.STAFF);
  assert(listMealsRes.status === 200, 'GET /food/meals lists meals (200)');
  assert(listMealsRes.data?.data?.items?.length >= 1, 'Listed meals length >= 1');

  // Get single meal
  const getMealRes = await request('GET', `/food/meals/${createdMealId}`, null, tokens.RESIDENT);
  assert(getMealRes.status === 200, 'GET /food/meals/:id returns meal details (200)');

  // Update meal record
  const updateMealRes = await request('PATCH', `/food/meals/${createdMealId}`, { expectedCount: 55 }, tokens.STAFF);
  assert(updateMealRes.status === 200, 'PATCH /food/meals/:id updates meal counts (200)');
  assert(updateMealRes.data?.data?.expectedCount === 55, 'Updated expectedCount verified');

  // STEP 5: MEAL ATTENDANCE
  console.log('\n--- STEP 5: MEAL ATTENDANCE ---');
  let createdAttendanceId = '';
  const attPayload = {
    mealRecordId: createdMealId,
    status: 'PRESENT',
    notes: 'Attended on time',
  };

  // Resident marking their own attendance
  const createAttRes = await request('POST', '/food/attendance', attPayload, tokens.RESIDENT);
  assert(createAttRes.status === 201, 'POST /food/attendance by RESIDENT marks own attendance (201)');
  assert(createAttRes.data?.data?.status === 'PRESENT', 'Attendance status is PRESENT');
  createdAttendanceId = createAttRes.data?.data?.id;

  // Prevent duplicate attendance
  const dupAttRes = await request('POST', '/food/attendance', attPayload, tokens.RESIDENT);
  assert(dupAttRes.status === 400, 'Duplicate attendance record rejected (400)');

  // List attendance as RESIDENT (scoped to self)
  const listAttRes = await request('GET', `/food/attendance?mealRecordId=${createdMealId}`, null, tokens.RESIDENT);
  assert(listAttRes.status === 200, 'GET /food/attendance succeeds for RESIDENT (200)');
  assert(listAttRes.data?.data?.items?.length === 1, 'Resident sees only their own attendance record');

  // Resident querying another resident's attendance -> 403
  const illegalAttQuery = await request('GET', `/food/attendance?residentId=${OTHER_RESIDENT_ID}`, null, tokens.RESIDENT);
  assert(illegalAttQuery.status === 403, 'Resident querying another resident attendance blocked (403)');

  // Update attendance (opt-out)
  const updateAttRes = await request('PATCH', `/food/attendance/${createdAttendanceId}`, { status: 'OPTED_OUT' }, tokens.RESIDENT);
  assert(updateAttRes.status === 200, 'PATCH /food/attendance/:id updates status to OPTED_OUT (200)');
  assert(updateAttRes.data?.data?.status === 'OPTED_OUT', 'Attendance status updated to OPTED_OUT');

  // STEP 6: FOOD VENDORS
  console.log('\n--- STEP 6: FOOD VENDORS ---');
  let createdVendorId = '';
  const vendorPayload = {
    name: `Green Farms Wholesale Vegetables ${runId}`,
    phone: `+9199${Math.floor(Math.random() * 90000000 + 10000000)}`,
    propertyId: PROPERTY_ID,
    category: 'VEGETABLE_VENDOR',
    contactPerson: 'Suresh Gowda',
    email: `suresh_${runId}@greenfarms.com`,
    address: 'APMC Yard, Yard No 12, Bengaluru',
    gstin: '29ABCDE1234F1Z5',
    paymentTerms: 'Net 15 Days',
    isActive: true,
  };

  const createVendorRes = await request('POST', '/food/vendors', vendorPayload, tokens.OWNER);
  assert(createVendorRes.status === 201, 'POST /food/vendors creates food vendor (201)');
  assert(createVendorRes.data?.data?.name === vendorPayload.name, 'Food vendor name verified');
  createdVendorId = createVendorRes.data?.data?.id;

  // List vendors
  const listVendorsRes = await request('GET', '/food/vendors', null, tokens.MANAGER);
  assert(listVendorsRes.status === 200, 'GET /food/vendors lists vendors for manager (200)');
  assert(listVendorsRes.data?.data?.items?.length >= 1, 'Vendors list length >= 1');

  // Get single vendor
  const getVendorRes = await request('GET', `/food/vendors/${createdVendorId}`, null, tokens.ACCOUNTANT);
  assert(getVendorRes.status === 200, 'GET /food/vendors/:id accessible by accountant (200)');

  // Update vendor
  const updateVendorRes = await request('PATCH', `/food/vendors/${createdVendorId}`, { contactPerson: 'Suresh M Gowda' }, tokens.MANAGER);
  assert(updateVendorRes.status === 200, 'PATCH /food/vendors/:id updates contact person (200)');
  assert(updateVendorRes.data?.data?.contactPerson === 'Suresh M Gowda', 'Updated vendor contact verified');

  // STEP 7: FOOD EXPENSES
  console.log('\n--- STEP 7: FOOD EXPENSES ---');
  let createdExpenseId = '';
  const expensePayload = {
    propertyId: PROPERTY_ID,
    vendorId: createdVendorId,
    amount: 8750.50,
    itemsDescription: 'Bulk purchase: 100kg potatoes, 60kg onions, 40kg tomatoes',
    invoiceNumber: `INV-GF-${runId}`,
    expenseDate: new Date().toISOString(),
    paymentStatus: 'PAID',
    paymentMethod: 'UPI',
  };

  const createExpenseRes = await request('POST', '/food/expenses', expensePayload, tokens.ACCOUNTANT);
  assert(createExpenseRes.status === 201, 'POST /food/expenses by ACCOUNTANT records expense (201)');
  assert(parseFloat(createExpenseRes.data?.data?.amount) === 8750.5, 'Decimal amount matches 8750.50');
  createdExpenseId = createExpenseRes.data?.data?.id;

  // List expenses
  const listExpensesRes = await request('GET', '/food/expenses', null, tokens.ACCOUNTANT);
  assert(listExpensesRes.status === 200, 'GET /food/expenses lists expenses (200)');
  assert(listExpensesRes.data?.data?.items?.length >= 1, 'Expenses length >= 1');

  // Update expense
  const updateExpenseRes = await request('PATCH', `/food/expenses/${createdExpenseId}`, { amount: 8900.00 }, tokens.ACCOUNTANT);
  assert(updateExpenseRes.status === 200, 'PATCH /food/expenses/:id updates Decimal amount (200)');
  assert(parseFloat(updateExpenseRes.data?.data?.amount) === 8900.0, 'Updated Decimal amount matches 8900.00');

  // STEP 8: INVENTORY ITEMS & TRANSACTIONS
  console.log('\n--- STEP 8: INVENTORY ITEMS & TRANSACTIONS ---');
  let createdItemId = '';
  const invPayload = {
    propertyId: PROPERTY_ID,
    name: `Sona Masoori Rice 25kg Bag ${runId}`,
    sku: `RICE-${runId}`,
    category: 'GROCERIES_FOOD',
    unit: 'PACK',
    currentStock: 10.0,
    minimumStock: 5.0,
    maximumStock: 50.0,
    purchasePrice: 1350.0,
    vendorId: createdVendorId,
    status: 'IN_STOCK',
    locationNote: 'Main Mess Pantry Shelf A1',
  };

  const createItemInvRes = await request('POST', '/food/inventory', invPayload, tokens.STAFF);
  assert(createItemInvRes.status === 201, 'POST /food/inventory creates inventory item by STAFF (201)');
  assert(createItemInvRes.data?.data?.name === invPayload.name, 'Inventory item name verified');
  assert(parseFloat(createItemInvRes.data?.data?.currentStock) === 10.0, 'Initial current stock matches 10.0');
  createdItemId = createItemInvRes.data?.data?.id;

  // List inventory
  const listInvRes = await request('GET', '/food/inventory', null, tokens.STAFF);
  assert(listInvRes.status === 200, 'GET /food/inventory lists items (200)');
  assert(listInvRes.data?.data?.items?.length >= 1, 'Inventory items count >= 1');

  // Stock In transaction (+5)
  const stockInPayload = {
    type: 'STOCK_IN',
    quantity: 5.0,
    unitPrice: 1350.0,
    notes: 'Received restock order',
  };
  const stockInRes = await request('POST', `/food/inventory/${createdItemId}/transactions`, stockInPayload, tokens.STAFF);
  assert(stockInRes.status === 201, 'POST /food/inventory/:id/transactions STOCK_IN processed (201)');
  assert(parseFloat(stockInRes.data?.data?.newStock) === 15.0, 'Stock calculated from 10.0 to 15.0');

  // Stock Out transaction (-12)
  const stockOutPayload = {
    type: 'STOCK_OUT',
    quantity: 12.0,
    notes: 'Issued to kitchen for weekly cooking',
  };
  const stockOutRes = await request('POST', `/food/inventory/${createdItemId}/transactions`, stockOutPayload, tokens.STAFF);
  assert(stockOutRes.status === 201, 'POST /food/inventory/:id/transactions STOCK_OUT processed (201)');
  assert(parseFloat(stockOutRes.data?.data?.newStock) === 3.0, 'Stock calculated from 15.0 to 3.0');

  // Verify item status updated to LOW_STOCK (since 3.0 <= minimumStock 5.0)
  const getItemInvRes = await request('GET', `/food/inventory/${createdItemId}`, null, tokens.STAFF);
  assert(getItemInvRes.status === 200, 'GET /food/inventory/:id returns updated item (200)');
  assert(getItemInvRes.data?.data?.status === 'LOW_STOCK', 'Item status dynamically updated to LOW_STOCK');

  // Negative stock prevention (attempt to issue 10 units when only 3 remain)
  const negStockPayload = {
    type: 'STOCK_OUT',
    quantity: 10.0,
    notes: 'Attempting excessive issue',
  };
  const negStockRes = await request('POST', `/food/inventory/${createdItemId}/transactions`, negStockPayload, tokens.STAFF);
  assert(negStockRes.status === 400, 'Negative stock transaction rejected with 400 Bad Request');

  // List transactions history
  const listTxRes = await request('GET', `/food/inventory/${createdItemId}/transactions`, null, tokens.STAFF);
  assert(listTxRes.status === 200, 'GET /food/inventory/:id/transactions returns transaction history (200)');
  assert(listTxRes.data?.data?.items?.length === 2, 'Transaction history contains exactly 2 recorded transactions');

  // STEP 9: PURCHASE RECORDS & ITEMS
  console.log('\n--- STEP 9: PURCHASE RECORDS & ITEMS ---');
  let createdPurchaseId = '';
  const purchasePayload = {
    propertyId: PROPERTY_ID,
    vendorId: createdVendorId,
    poNumber: `PO-FOOD-${runId}`,
    invoiceNumber: `INV-GF-${runId}`,
    purchaseDate: '2026-10-10',
    taxAmount: 200.0,
    discountAmount: 100.0,
    status: 'RECEIVED',
    notes: 'Monthly bulk food purchase',
    items: [
      {
        inventoryItemId: createdItemId,
        quantity: 10.0,
        unitPrice: 1300.0, // total = 13000.00
      },
    ],
  };

  const createPurchaseRes = await request('POST', '/food/purchases', purchasePayload, tokens.ACCOUNTANT);
  assert(createPurchaseRes.status === 201, 'POST /food/purchases creates purchase record with items (201)');
  assert(parseFloat(createPurchaseRes.data?.data?.totalAmount) === 13000.0, 'Total amount calculated as 13000.00');
  assert(parseFloat(createPurchaseRes.data?.data?.netAmount) === 13100.0, 'Net amount (13000 + 200 - 100) calculated as 13100.00');
  createdPurchaseId = createPurchaseRes.data?.data?.id;

  // Add another item to purchase record
  const addItemRes = await request('POST', `/food/purchases/${createdPurchaseId}/items`, {
    inventoryItemId: createdItemId,
    quantity: 2.0,
    unitPrice: 1300.0, // + 2600.00
  }, tokens.ACCOUNTANT);
  assert(addItemRes.status === 201, 'POST /food/purchases/:id/items adds item to purchase (201)');

  // Verify updated purchase totals
  const getPurchaseRes = await request('GET', `/food/purchases/${createdPurchaseId}`, null, tokens.ACCOUNTANT);
  assert(parseFloat(getPurchaseRes.data?.data?.totalAmount) === 15600.0, 'Updated purchase totalAmount is 15600.00');
  assert(parseFloat(getPurchaseRes.data?.data?.netAmount) === 15700.0, 'Updated purchase netAmount is 15700.00');

  // STEP 10: REPORTS
  console.log('\n--- STEP 10: REPORTS ---');
  const mealSummaryRes = await request('GET', '/food/reports/meal-summary', null, tokens.MANAGER);
  assert(mealSummaryRes.status === 200, 'GET /food/reports/meal-summary returns HTTP 200');
  assert(mealSummaryRes.data?.data?.totalMealsLogged >= 1, 'Report includes logged meals');

  const attReportRes = await request('GET', '/food/reports/attendance', null, tokens.ACCOUNTANT);
  assert(attReportRes.status === 200, 'GET /food/reports/attendance returns HTTP 200');
  assert(attReportRes.data?.data?.totalAttendances >= 1, 'Report includes recorded attendance');

  const expReportRes = await request('GET', '/food/reports/expenses', null, tokens.ACCOUNTANT);
  assert(expReportRes.status === 200, 'GET /food/reports/expenses returns HTTP 200');
  assert(parseFloat(expReportRes.data?.data?.totalAmount) >= 8900.0, 'Report computes total expense amount');

  const invReportRes = await request('GET', '/food/reports/inventory', null, tokens.MANAGER);
  assert(invReportRes.status === 200, 'GET /food/reports/inventory returns HTTP 200');
  assert(invReportRes.data?.data?.totalItems >= 1, 'Report includes inventory items');

  const purchReportRes = await request('GET', '/food/reports/purchases', null, tokens.ACCOUNTANT);
  assert(purchReportRes.status === 200, 'GET /food/reports/purchases returns HTTP 200');
  assert(parseFloat(purchReportRes.data?.data?.totalSpent) >= 15700.0, 'Report computes purchase net expenditure');

  // STEP 11: SECURITY & RBAC CONSTRAINTS
  console.log('\n--- STEP 11: SECURITY & RBAC CONSTRAINTS ---');

  // Missing JWT -> 401
  const noJwtRes = await request('GET', '/food/weekly-menus', null, null);
  assert(noJwtRes.status === 401, 'Request without JWT returns 401 Unauthorized');

  // Missing X-Organization-Id header -> 400
  const noOrgRes = await request('GET', '/food/weekly-menus', null, tokens.OWNER, null);
  assert(noOrgRes.status === 400, 'Request without X-Organization-Id header returns 400 Bad Request');

  // Invalid UUID organization header -> 400
  const invalidOrgRes = await request('GET', '/food/weekly-menus', null, tokens.OWNER, 'not-a-valid-uuid');
  assert(invalidOrgRes.status === 400, 'Invalid UUID organization header returns 400 Bad Request');

  // Cross-org header (user not member) -> 403
  const crossOrgRes = await request('GET', '/food/weekly-menus', null, tokens.OWNER, CROSS_ORG_ID);
  assert(crossOrgRes.status === 403, 'Non-member organization header returns 403 Forbidden');

  // Cross-org property -> 404
  const crossOrgPropertyRes = await request('POST', '/food/weekly-menus', {
    propertyId: CROSS_ORG_ID,
    name: 'Hacked Menu',
    weekStartDate: '2026-11-01',
  }, tokens.OWNER);
  assert(crossOrgPropertyRes.status === 404, 'Property from another organization returns 404 Not Found');

  // Invalid UUID param -> 400
  const invalidUuidRes = await request('GET', '/food/weekly-menus/not-a-uuid', null, tokens.OWNER);
  assert(invalidUuidRes.status === 400, 'Invalid UUID path parameter returns 400 Bad Request');

  // Invalid Enum payload -> 400
  const invalidEnumRes = await request('POST', '/food/menu-items', {
    weeklyMenuId: createdWeeklyMenuId,
    dayOfWeek: 'FUNDAY', // invalid enum
    mealType: 'BREAKFAST',
    title: 'Pancakes',
    itemsDescription: 'Pancakes with maple syrup',
  }, tokens.MANAGER);
  assert(invalidEnumRes.status === 400, 'Invalid Enum in payload returns 400 Bad Request');

  // Extra non-whitelisted property -> 400
  const extraPropRes = await request('POST', '/food/weekly-menus', {
    propertyId: PROPERTY_ID,
    name: 'Strict Menu',
    weekStartDate: '2026-11-15',
    hackerField: 'malicious',
  }, tokens.OWNER);
  assert(extraPropRes.status === 400, 'Non-whitelisted payload property returns 400 Bad Request');

  // RESIDENT restricted from creating menus -> 403
  const resCreateMenu = await request('POST', '/food/weekly-menus', menuPayload, tokens.RESIDENT);
  assert(resCreateMenu.status === 403, 'RESIDENT creating weekly menu returns 403 Forbidden');

  // RESIDENT restricted from vendors -> 403
  const resVendorRes = await request('GET', '/food/vendors', null, tokens.RESIDENT);
  assert(resVendorRes.status === 403, 'RESIDENT accessing vendor directory returns 403 Forbidden');

  // RESIDENT restricted from expenses -> 403
  const resExpenseRes = await request('GET', '/food/expenses', null, tokens.RESIDENT);
  assert(resExpenseRes.status === 403, 'RESIDENT accessing food expenses returns 403 Forbidden');

  // RESIDENT restricted from inventory -> 403
  const resInvRes = await request('GET', '/food/inventory', null, tokens.RESIDENT);
  assert(resInvRes.status === 403, 'RESIDENT accessing inventory returns 403 Forbidden');

  // RESIDENT restricted from purchases -> 403
  const resPurchRes = await request('GET', '/food/purchases', null, tokens.RESIDENT);
  assert(resPurchRes.status === 403, 'RESIDENT accessing purchases returns 403 Forbidden');

  // STAFF restricted from expenses -> 403
  const staffExpenseRes = await request('GET', '/food/expenses', null, tokens.STAFF);
  assert(staffExpenseRes.status === 403, 'STAFF accessing food expenses returns 403 Forbidden');

  // ACCOUNTANT restricted from recording attendance -> 403
  const accAttRes = await request('POST', '/food/attendance', attPayload, tokens.ACCOUNTANT);
  assert(accAttRes.status === 403, 'ACCOUNTANT recording meal attendance returns 403 Forbidden');

  // STEP 12: DATA INTEGRITY & AUDIT LOGS
  console.log('\n--- STEP 12: DATA INTEGRITY & AUDIT LOGS ---');

  // Check orphan menu items
  const orphanMenuItems = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM daily_menu_items WHERE "weeklyMenuId" NOT IN (SELECT id FROM weekly_menus)`;
  assert(orphanMenuItems[0].count === 0, 'No orphan daily menu items found (0)');

  // Check orphan attendances
  const orphanAttendances = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM meal_attendances WHERE "mealRecordId" NOT IN (SELECT id FROM meal_records)`;
  assert(orphanAttendances[0].count === 0, 'No orphan meal attendances found (0)');

  // Check orphan purchase items
  const orphanPurchaseItems = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM purchase_record_items WHERE "purchaseRecordId" NOT IN (SELECT id FROM purchase_records)`;
  assert(orphanPurchaseItems[0].count === 0, 'No orphan purchase record items found (0)');

  // Check orphan inventory transactions
  const orphanInventoryTx = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM inventory_transactions WHERE "itemId" NOT IN (SELECT id FROM inventory_items)`;
  assert(orphanInventoryTx[0].count === 0, 'No orphan inventory transactions found (0)');

  // Verify audit logs generated
  const auditLogsCount = await prisma.audit_logs.count({
    where: {
      organizationId: ORG_ID,
      action: { startsWith: 'food.' },
    },
  });
  assert(auditLogsCount >= 8, `Audit logs generated for food mutations (${auditLogsCount} found)`);

  console.log('\n=============================================');
  console.log(`PHASE 11 TEST RESULTS:`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log(`  TOTAL : ${passed + failed}`);
  console.log('=============================================\n');

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
