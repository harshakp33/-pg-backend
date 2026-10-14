const { PrismaClient, InvoiceStatus, PaymentStatus, DepositTxType, ExpenseCategory } = require('C:/Users/harsh/Downloads/pg-backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
const jwt = require('C:/Users/harsh/Downloads/pg-backend/node_modules/jsonwebtoken');
const fs = require('fs');

const env = fs.readFileSync('C:/Users/harsh/Downloads/pg-backend/.env', 'utf8');
let jwtSecret = '';
env.split('\n').forEach(line => {
  const m = line.match(/^\s*JWT_SECRET\s*=\s*(.*)?\s*$/);
  if (m) jwtSecret = m[1].trim().replace(/^['"]|['"]$/g, '');
});

function createToken(userId, email) {
  return jwt.sign({ sub: userId, email }, jwtSecret, { expiresIn: '1h' });
}

const BASE_URL = 'http://localhost:4000/api';
const ORG_1_ID = '0d65eb80-f0b1-4d96-b87f-99fbc75bbe49'; // BLR Luxury Co-Living Stays
const FOREIGN_ID = 'a0000000-0000-4000-8000-000000000001'; // Valid UUID v4 not in Org 1

const ownerToken = createToken('c9b7c9e5-a3f9-4072-89b8-f84cd21edd98', 'owner@blrstays.com');
const accountantToken = createToken('e4af3ac7-d062-4dd4-90f3-2ba31213635a', 'accountant@blrstays.com');
const managerToken = createToken('cd01d46f-89e5-4ded-b3cb-590b3c47effa', 'manager@blrstays.com');
const staffToken = createToken('2f36f7ff-70da-453f-ba38-cd4f90be2035', 'staff@blrstays.com');
const residentToken = createToken('182f4fd2-5886-42f9-8bff-e6114e74f254', 'resident@blrstays.com');

const results = [];
function record(moduleName, testName, expected, actual, details = '') {
  const pass = String(expected) === String(actual);
  results.push({
    module: moduleName,
    test: testName,
    expected: String(expected),
    actual: String(actual),
    status: pass ? 'PASS' : 'FAIL',
    details: details ? String(details) : '',
  });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${moduleName} - ${testName} (Expected: ${expected}, Actual: ${actual}) ${details}`);
}

async function run() {
  console.log('====================================================');
  console.log('STARTING PHASE 9 COMPREHENSIVE VERIFICATION SUITE');
  console.log('====================================================\n');

  // Query existing active property and resident
  const property = await prisma.properties.findFirst({ where: { organizationId: ORG_1_ID, deletedAt: null } });
  const resident = await prisma.residents.findFirst({ where: { organizationId: ORG_1_ID, deletedAt: null } });

  if (!property || !resident) {
    console.error('Fatal: Required property or resident not found in DB');
    process.exit(1);
  }

  // ----------------------------------------------------
  // 1. INVOICES MODULE
  // ----------------------------------------------------
  console.log('\n--- 1. INVOICES MODULE ---');

  // 1.1 Create Invoice with Line Items & Decimal Arithmetic
  const createInvRes = await fetch(`${BASE_URL}/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      billingPeriodStart: '2026-10-01',
      billingPeriodEnd: '2026-10-31',
      dueDate: '2026-10-05',
      baseRent: 8000,
      additionalCharges: 500,
      lateFees: 100,
      discounts: 200,
      adjustments: 50,
      items: [
        { chargeType: 'BASE_RENT', description: 'Monthly Bed Rent', amount: 8000, isDeduction: false },
        { chargeType: 'MAINTENANCE', description: 'Maintenance Services', amount: 500, isDeduction: false },
        { chargeType: 'DISCOUNT', description: 'Early Bird Discount', amount: 200, isDeduction: true },
      ],
      notes: 'October billing cycle invoice'
    })
  });
  const invData = (await createInvRes.json()).data;
  record('Invoices', 'Create invoice with items (Accountant)', 201, createInvRes.status, `ID: ${invData?.id}`);

  // Expected NetPayable = 8000 + 500 + 100 - 200 - 50 = 8350.00
  const expectedNet = '8350';
  const actualNet = String(invData?.netPayable).split('.')[0];
  record('Invoices', 'Decimal NetPayable calculation', expectedNet, actualNet, `netPayable: ${invData?.netPayable}`);

  // 1.2 List Invoices with pagination and filter
  const listInvRes = await fetch(`${BASE_URL}/invoices?residentId=${resident.id}&page=1&limit=10`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  const invList = (await listInvRes.json()).data;
  record('Invoices', 'List invoices with filter', 200, listInvRes.status, `Items count: ${invList?.items?.length}`);

  // 1.3 Get Single Invoice
  const getInvRes = await fetch(`${BASE_URL}/invoices/${invData?.id}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  const singleInv = (await getInvRes.json()).data;
  record('Invoices', 'Get single invoice', 200, getInvRes.status, `Items count: ${singleInv?.invoice_items?.length}`);

  // 1.4 Update Invoice
  const updateInvRes = await fetch(`${BASE_URL}/invoices/${invData?.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({ notes: 'Updated invoice notes for October' })
  });
  record('Invoices', 'Update invoice notes', 200, updateInvRes.status);

  // 1.5 Invalid State Transition (ISSUED -> DRAFT is illegal)
  const invalidTransRes = await fetch(`${BASE_URL}/invoices/${invData?.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({ status: 'DRAFT' })
  });
  record('Invoices', 'Invalid state transition rejected (400)', 400, invalidTransRes.status);

  // 1.6 Foreign Resource Access (Cross-Org isolation - 404)
  const crossOrgInvRes = await fetch(`${BASE_URL}/invoices/${FOREIGN_ID}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Invoices', 'Cross-org invoice isolated (404)', 404, crossOrgInvRes.status);

  // 1.7 Foreign Resident validation on create
  const invalidResInv = await fetch(`${BASE_URL}/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: FOREIGN_ID,
      billingPeriodStart: '2026-10-01',
      billingPeriodEnd: '2026-10-31',
      dueDate: '2026-10-05',
      baseRent: 5000
    })
  });
  record('Invoices', 'Foreign resident rejected (404)', 404, invalidResInv.status);

  // 1.8 Cancel Invoice
  const cancelInvRes = await fetch(`${BASE_URL}/invoices/${invData?.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Invoices', 'Cancel unpaid invoice (DELETE)', 200, cancelInvRes.status);

  // ----------------------------------------------------
  // 2. PAYMENTS & ALLOCATIONS MODULE
  // ----------------------------------------------------
  console.log('\n--- 2. PAYMENTS & ALLOCATIONS MODULE ---');

  // Create a dedicated invoice for payment testing
  const payInvRes = await fetch(`${BASE_URL}/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      billingPeriodStart: '2026-10-01',
      billingPeriodEnd: '2026-10-31',
      dueDate: '2026-10-10',
      baseRent: 10000,
      notes: 'Payment test invoice'
    })
  });
  const payInvoice = (await payInvRes.json()).data;

  // 2.1 Create Partial Payment & Allocate Atomically
  const refNum1 = 'REF-PAY-' + Date.now();
  const payRes1 = await fetch(`${BASE_URL}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      invoiceId: payInvoice.id,
      amount: 4000,
      paymentMethod: 'UPI',
      referenceNumber: refNum1,
      notes: 'First installment'
    })
  });
  const payData1 = (await payRes1.json()).data;
  record('Payments', 'Create partial payment & allocate', 201, payRes1.status, `Receipt: ${payData1?.receiptNumber}`);

  // Verify DB state of invoice (PARTIALLY_PAID, paidAmount 4000, outstanding 6000)
  const dbInv1 = await prisma.invoices.findUnique({ where: { id: payInvoice.id } });
  record('Payments', 'Invoice updated to PARTIALLY_PAID', 'PARTIALLY_PAID', dbInv1.status);
  record('Payments', 'Invoice paidAmount = 4000', '4000', String(dbInv1.paidAmount).split('.')[0]);
  record('Payments', 'Invoice outstandingAmount = 6000', '6000', String(dbInv1.outstandingAmount).split('.')[0]);

  // 2.2 Overpayment Prevention (Remaining 6000, attempting to pay 7000)
  const overpayRes = await fetch(`${BASE_URL}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      invoiceId: payInvoice.id,
      amount: 7000,
      paymentMethod: 'UPI',
      referenceNumber: 'REF-OVERPAY-' + Date.now()
    })
  });
  record('Payments', 'Overpayment rejected (409 Conflict)', 409, overpayRes.status);

  // 2.3 Duplicate Reference Number Protection
  const dupRef = 'DUP-REF-' + Date.now();
  await fetch(`${BASE_URL}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      amount: 500,
      paymentMethod: 'CASH',
      referenceNumber: dupRef
    })
  });
  const dupRefRes = await fetch(`${BASE_URL}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      amount: 500,
      paymentMethod: 'CASH',
      referenceNumber: dupRef
    })
  });
  record('Payments', 'Duplicate reference rejected (409 Conflict)', 409, dupRefRes.status);

  // 2.4 Final Payment to fully settle invoice (Pay remaining 6000)
  const payResFinal = await fetch(`${BASE_URL}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      invoiceId: payInvoice.id,
      amount: 6000,
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: 'REF-FINAL-' + Date.now()
    })
  });
  record('Payments', 'Final settlement payment', 201, payResFinal.status);

  // Verify DB state of invoice (PAID, outstanding 0, paidAt not null)
  const dbInvSettled = await prisma.invoices.findUnique({ where: { id: payInvoice.id } });
  record('Payments', 'Invoice updated to PAID', 'PAID', dbInvSettled.status);
  record('Payments', 'Invoice outstanding = 0', '0', String(dbInvSettled.outstandingAmount).split('.')[0]);
  record('Payments', 'Invoice paidAt timestamp set', true, !!dbInvSettled.paidAt);

  // 2.5 Fully Paid Invoice Cancellation Prevention (Cannot cancel PAID invoice)
  const cancelPaidRes = await fetch(`${BASE_URL}/invoices/${payInvoice.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Invoices', 'Cannot cancel fully paid invoice (409 Conflict)', 409, cancelPaidRes.status);

  // 2.6 List & Get Payments
  const listPayRes = await fetch(`${BASE_URL}/payments?residentId=${resident.id}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Payments', 'List payments', 200, listPayRes.status);

  const getPayRes = await fetch(`${BASE_URL}/payments/${payData1.id}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Payments', 'Get single payment', 200, getPayRes.status);

  // 2.7 Foreign Payment isolation
  const crossOrgPayRes = await fetch(`${BASE_URL}/payments/${FOREIGN_ID}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Payments', 'Cross-org payment isolated (404)', 404, crossOrgPayRes.status);

  // ----------------------------------------------------
  // 3. DEPOSITS MODULE
  // ----------------------------------------------------
  console.log('\n--- 3. DEPOSITS MODULE ---');

  // 3.1 Deposit Collection
  const depCollectRes = await fetch(`${BASE_URL}/deposits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      transactionType: 'COLLECTED',
      amount: 15000,
      paymentMethod: 'UPI',
      referenceNumber: 'DEP-COLLECT-' + Date.now(),
      notes: 'Initial deposit collection'
    })
  });
  const depData = (await depCollectRes.json()).data;
  record('Deposits', 'Deposit collect (201)', 201, depCollectRes.status, `ID: ${depData?.id}`);

  // 3.2 List Deposits
  const listDepRes = await fetch(`${BASE_URL}/deposits?residentId=${resident.id}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Deposits', 'List deposits', 200, listDepRes.status);

  // 3.3 Get Single Deposit
  const getDepRes = await fetch(`${BASE_URL}/deposits/${depData.id}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Deposits', 'Get single deposit', 200, getDepRes.status);

  // 3.4 Deposit Refund Exceeding Balance Protection
  const overRefundRes = await fetch(`${BASE_URL}/deposits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      transactionType: 'REFUNDED',
      amount: 9999999, // Exceeds balance
      paymentMethod: 'BANK_TRANSFER'
    })
  });
  record('Deposits', 'Excessive refund rejected (409 Conflict)', 409, overRefundRes.status);

  // 3.5 Valid Partial Refund
  const validRefundRes = await fetch(`${BASE_URL}/deposits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      transactionType: 'REFUNDED',
      amount: 5000,
      paymentMethod: 'BANK_TRANSFER',
      notes: 'Partial advance refund'
    })
  });
  record('Deposits', 'Valid partial refund processed (201)', 201, validRefundRes.status);

  // 3.6 Foreign Deposit isolation
  const crossOrgDepRes = await fetch(`${BASE_URL}/deposits/${FOREIGN_ID}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Deposits', 'Cross-org deposit isolated (404)', 404, crossOrgDepRes.status);

  // ----------------------------------------------------
  // 4. EXPENSES MODULE
  // ----------------------------------------------------
  console.log('\n--- 4. EXPENSES MODULE ---');

  // 4.1 Create Expense
  const expRes = await fetch(`${BASE_URL}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      category: 'ELECTRICITY_BILL',
      title: 'October BESCOM Bill',
      amount: 4200,
      vendorName: 'BESCOM',
      invoiceReceiptUrl: 'https://storage.pg.com/receipts/bescom-oct.pdf'
    })
  });
  const expData = (await expRes.json()).data;
  record('Expenses', 'Create expense (201)', 201, expRes.status, `ID: ${expData?.id}`);

  // 4.2 List Expenses
  const listExpRes = await fetch(`${BASE_URL}/expenses?propertyId=${property.id}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Expenses', 'List expenses', 200, listExpRes.status);

  // 4.3 Get Single Expense
  const getExpRes = await fetch(`${BASE_URL}/expenses/${expData.id}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Expenses', 'Get single expense', 200, getExpRes.status);

  // 4.4 Update Expense
  const updateExpRes = await fetch(`${BASE_URL}/expenses/${expData.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({ title: 'October BESCOM Bill - Paid with rebate' })
  });
  record('Expenses', 'Update expense (200)', 200, updateExpRes.status);

  // 4.5 Soft-delete Expense
  const deleteExpRes = await fetch(`${BASE_URL}/expenses/${expData.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Expenses', 'Soft-delete expense (200)', 200, deleteExpRes.status);

  const dbExpDeleted = await prisma.expenses.findUnique({ where: { id: expData.id } });
  record('Expenses', 'deletedAt populated in DB', true, !!dbExpDeleted.deletedAt);

  // 4.6 Foreign Expense isolation
  const crossOrgExpRes = await fetch(`${BASE_URL}/expenses/${FOREIGN_ID}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('Expenses', 'Cross-org expense isolated (404)', 404, crossOrgExpRes.status);

  // ----------------------------------------------------
  // 5. RENT PLANS MODULE
  // ----------------------------------------------------
  console.log('\n--- 5. RENT PLANS MODULE ---');

  // 5.1 Create Rent Plan
  const planRes = await fetch(`${BASE_URL}/rent-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      name: 'Super Premium Suite ' + Date.now(),
      billingFrequency: 'MONTHLY',
      baseAmount: 14000,
      securityDeposit: 28000,
      noticePeriodDays: 30,
      lockInPeriodMonths: 3,
      foodIncluded: true,
      electricityIncluded: true,
      description: 'Fully furnished with AC and food'
    })
  });
  const planData = (await planRes.json()).data;
  record('RentPlans', 'Create rent plan (201)', 201, planRes.status, `ID: ${planData?.id}`);

  // 5.2 List Rent Plans
  const listPlanRes = await fetch(`${BASE_URL}/rent-plans?propertyId=${property.id}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('RentPlans', 'List rent plans', 200, listPlanRes.status);

  // 5.3 Get Rent Plan
  const getPlanRes = await fetch(`${BASE_URL}/rent-plans/${planData.id}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('RentPlans', 'Get rent plan', 200, getPlanRes.status);

  // 5.4 Update Rent Plan
  const updatePlanRes = await fetch(`${BASE_URL}/rent-plans/${planData.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({ baseAmount: 14500 })
  });
  record('RentPlans', 'Update rent plan (200)', 200, updatePlanRes.status);

  // 5.5 Deactivate Rent Plan
  const deletePlanRes = await fetch(`${BASE_URL}/rent-plans/${planData.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('RentPlans', 'Deactivate rent plan (200)', 200, deletePlanRes.status);

  const dbPlan = await prisma.rent_plans.findUnique({ where: { id: planData.id } });
  record('RentPlans', 'isActive set to false', false, dbPlan.isActive);

  // 5.6 Foreign Rent Plan isolation
  const crossOrgPlanRes = await fetch(`${BASE_URL}/rent-plans/${FOREIGN_ID}`, {
    headers: { 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID }
  });
  record('RentPlans', 'Cross-org rent plan isolated (404)', 404, crossOrgPlanRes.status);

  // ----------------------------------------------------
  // 6. FINANCIAL CONCURRENCY TESTS
  // ----------------------------------------------------
  console.log('\n--- 6. FINANCIAL CONCURRENCY TESTS ---');

  // 6.1 Concurrent Payment on Same Invoice
  const conInvRes = await fetch(`${BASE_URL}/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      billingPeriodStart: '2026-11-01',
      billingPeriodEnd: '2026-11-30',
      dueDate: '2026-11-05',
      baseRent: 5000,
      notes: 'Concurrent payment test invoice'
    })
  });
  const conInv = (await conInvRes.json()).data;

  // Run two concurrent payments each trying to pay 5000 on the same 5000 invoice
  const [conPay1, conPay2] = await Promise.all([
    fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
      body: JSON.stringify({
        propertyId: property.id,
        residentId: resident.id,
        invoiceId: conInv.id,
        amount: 5000,
        paymentMethod: 'UPI',
        referenceNumber: 'CONCUR-PAY-1-' + Date.now(),
      })
    }),
    fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
      body: JSON.stringify({
        propertyId: property.id,
        residentId: resident.id,
        invoiceId: conInv.id,
        amount: 5000,
        paymentMethod: 'UPI',
        referenceNumber: 'CONCUR-PAY-2-' + Date.now(),
      })
    })
  ]);

  const conPayStatuses = [conPay1.status, conPay2.status].sort();
  const conPayPass = conPayStatuses[0] === 201 && (conPayStatuses[1] === 409 || conPayStatuses[1] === 400);
  record('Concurrency', 'Same invoice concurrent payment', '201 and 409', `${conPayStatuses[0]} and ${conPayStatuses[1]}`, conPayPass ? 'Handled safely with FOR UPDATE lock' : 'Failed');

  // Verify the invoice did NOT get overpaid in DB
  const conDbInv = await prisma.invoices.findUnique({ where: { id: conInv.id } });
  record('Concurrency', 'Invoice paidAmount strictly 5000 (No overpayment)', '5000', String(conDbInv.paidAmount).split('.')[0]);

  // 6.2 Concurrent Deposit Refund on Same Balance
  // First, collect a known deposit of 7000 for resident
  await fetch(`${BASE_URL}/deposits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
    body: JSON.stringify({
      propertyId: property.id,
      residentId: resident.id,
      transactionType: 'COLLECTED',
      amount: 7000,
      paymentMethod: 'UPI',
      referenceNumber: 'CONCUR-DEP-SEED-' + Date.now()
    })
  });

  // Now, calculate current deposit balance
  const allDepTxs = await prisma.deposit_transactions.findMany({
    where: { organizationId: ORG_1_ID, residentId: resident.id }
  });
  let currentDepBalance = 0;
  for (const t of allDepTxs) {
    if (t.transactionType === 'COLLECTED') currentDepBalance += Number(t.amount);
    else currentDepBalance -= Number(t.amount);
  }

  // Attempt two concurrent refunds each requesting the FULL current balance
  const [conRef1, conRef2] = await Promise.all([
    fetch(`${BASE_URL}/deposits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
      body: JSON.stringify({
        propertyId: property.id,
        residentId: resident.id,
        transactionType: 'REFUNDED',
        amount: currentDepBalance,
        paymentMethod: 'BANK_TRANSFER',
        referenceNumber: 'CONCUR-REF-1-' + Date.now()
      })
    }),
    fetch(`${BASE_URL}/deposits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
      body: JSON.stringify({
        propertyId: property.id,
        residentId: resident.id,
        transactionType: 'REFUNDED',
        amount: currentDepBalance,
        paymentMethod: 'BANK_TRANSFER',
        referenceNumber: 'CONCUR-REF-2-' + Date.now()
      })
    })
  ]);

  const conRefStatuses = [conRef1.status, conRef2.status].sort();
  const conRefPass = conRefStatuses[0] === 201 && conRefStatuses[1] === 409;
  record('Concurrency', 'Same deposit concurrent refund', '201 and 409', `${conRefStatuses[0]} and ${conRefStatuses[1]}`, conRefPass ? 'Handled safely with FOR UPDATE lock' : 'Failed');

  // 6.3 Concurrent Duplicate Payment Reference
  const concurDupRef = 'CONCUR-DUP-REF-' + Date.now();
  const [conDupPay1, conDupPay2] = await Promise.all([
    fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
      body: JSON.stringify({
        propertyId: property.id,
        residentId: resident.id,
        amount: 300,
        paymentMethod: 'UPI',
        referenceNumber: concurDupRef
      })
    }),
    fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accountantToken}`, 'X-Organization-Id': ORG_1_ID },
      body: JSON.stringify({
        propertyId: property.id,
        residentId: resident.id,
        amount: 300,
        paymentMethod: 'UPI',
        referenceNumber: concurDupRef
      })
    })
  ]);

  const conDupStatuses = [conDupPay1.status, conDupPay2.status].sort();
  const conDupPass = conDupStatuses[0] === 201 && conDupStatuses[1] === 409;
  record('Concurrency', 'Duplicate payment reference concurrent race', '201 and 409', `${conDupStatuses[0]} and ${conDupStatuses[1]}`, conDupPass ? 'Handled safely with advisory lock' : 'Failed');

  // ----------------------------------------------------
  // 7. REAL USER RBAC MATRIX TESTS
  // ----------------------------------------------------
  console.log('\n--- 7. REAL USER RBAC MATRIX TESTS ---');

  const rbacUsers = [
    { role: 'OWNER', token: ownerToken, canAccess: true },
    { role: 'ACCOUNTANT', token: accountantToken, canAccess: true },
    { role: 'MANAGER', token: managerToken, canAccess: false },
    { role: 'STAFF', token: staffToken, canAccess: false },
    { role: 'RESIDENT', token: residentToken, canAccess: false },
  ];

  for (const u of rbacUsers) {
    const res = await fetch(`${BASE_URL}/invoices`, {
      headers: { 'Authorization': `Bearer ${u.token}`, 'X-Organization-Id': ORG_1_ID }
    });
    const expectedStatus = u.canAccess ? 200 : 403;
    record('RBAC', `GET /invoices - ${u.role}`, expectedStatus, res.status);
  }

  for (const u of rbacUsers) {
    const res = await fetch(`${BASE_URL}/payments`, {
      headers: { 'Authorization': `Bearer ${u.token}`, 'X-Organization-Id': ORG_1_ID }
    });
    const expectedStatus = u.canAccess ? 200 : 403;
    record('RBAC', `GET /payments - ${u.role}`, expectedStatus, res.status);
  }

  for (const u of rbacUsers) {
    const res = await fetch(`${BASE_URL}/deposits`, {
      headers: { 'Authorization': `Bearer ${u.token}`, 'X-Organization-Id': ORG_1_ID }
    });
    const expectedStatus = u.canAccess ? 200 : 403;
    record('RBAC', `GET /deposits - ${u.role}`, expectedStatus, res.status);
  }

  for (const u of rbacUsers) {
    const res = await fetch(`${BASE_URL}/expenses`, {
      headers: { 'Authorization': `Bearer ${u.token}`, 'X-Organization-Id': ORG_1_ID }
    });
    const expectedStatus = u.canAccess ? 200 : 403;
    record('RBAC', `GET /expenses - ${u.role}`, expectedStatus, res.status);
  }

  for (const u of rbacUsers) {
    const res = await fetch(`${BASE_URL}/rent-plans`, {
      headers: { 'Authorization': `Bearer ${u.token}`, 'X-Organization-Id': ORG_1_ID }
    });
    const expectedStatus = u.canAccess ? 200 : 403;
    record('RBAC', `GET /rent-plans - ${u.role}`, expectedStatus, res.status);
  }

  // ----------------------------------------------------
  // 8. AUDIT LOGS IN POSTGRESQL VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- 8. AUDIT LOGS IN POSTGRESQL ---');
  const auditLogs = await prisma.audit_logs.findMany({
    where: {
      organizationId: ORG_1_ID,
      action: {
        in: [
          'invoice.created',
          'invoice.updated',
          'invoice.cancelled',
          'payment.created',
          'deposit.created',
          'deposit.refunded',
          'expense.created',
          'expense.updated',
          'expense.deleted',
          'rent_plan.created',
          'rent_plan.updated',
          'rent_plan.deactivated'
        ]
      }
    }
  });

  const actions = new Set(auditLogs.map(a => a.action));
  console.log('Recorded Phase 9 Audit Actions in PostgreSQL:', Array.from(actions));
  record('AuditLogs', 'invoice.created logged in audit_logs', true, actions.has('invoice.created'));
  record('AuditLogs', 'invoice.cancelled logged in audit_logs', true, actions.has('invoice.cancelled'));
  record('AuditLogs', 'payment.created logged in audit_logs', true, actions.has('payment.created'));
  record('AuditLogs', 'deposit.created logged in audit_logs', true, actions.has('deposit.created'));
  record('AuditLogs', 'deposit.refunded logged in audit_logs', true, actions.has('deposit.refunded'));
  record('AuditLogs', 'expense.created logged in audit_logs', true, actions.has('expense.created'));
  record('AuditLogs', 'expense.deleted logged in audit_logs', true, actions.has('expense.deleted'));
  record('AuditLogs', 'rent_plan.created logged in audit_logs', true, actions.has('rent_plan.created'));
  record('AuditLogs', 'rent_plan.deactivated logged in audit_logs', true, actions.has('rent_plan.deactivated'));

  console.log('\n====================================================');
  console.log('PHASE 9 COMPREHENSIVE TEST SUMMARY:');
  console.log('====================================================');
  console.table(results);

  const failures = results.filter(r => r.status === 'FAIL');
  console.log(`Total tests: ${results.length}, Passed: ${results.length - failures.length}, Failed: ${failures.length}`);
  if (failures.length > 0) {
    console.error('FAILED TESTS:', failures);
    process.exit(1);
  }

  await prisma.$disconnect();
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
