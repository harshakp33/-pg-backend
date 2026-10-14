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

function createToken(userId, email) {
  return jwt.sign({ sub: userId, email }, jwtSecret, { expiresIn: '15m' });
}

const rolesData = [
  { role: 'OWNER', email: 'owner@blrstays.com', userId: 'c9b7c9e5-a3f9-4072-89b8-f84cd21edd98', isAuthorized: true },
  { role: 'ACCOUNTANT', email: 'accountant@blrstays.com', userId: 'e4af3ac7-d062-4dd4-90f3-2ba31213635a', isAuthorized: true },
  { role: 'MANAGER', email: 'manager@blrstays.com', userId: 'cd01d46f-89e5-4ded-b3cb-590b3c47effa', isAuthorized: false },
  { role: 'STAFF', email: 'staff@blrstays.com', userId: '2f36f7ff-70da-453f-ba38-cd4f90be2035', isAuthorized: false },
  { role: 'RESIDENT', email: 'resident@blrstays.com', userId: '182f4fd2-5886-42f9-8bff-e6114e74f254', isAuthorized: false },
];

async function runRbacTests() {
  const property = await prisma.properties.findFirst({ where: { organizationId: ORG_ID, deletedAt: null } });
  const resident = await prisma.residents.findFirst({ where: { organizationId: ORG_ID, deletedAt: null } });

  const testResults = [];

  const createdIds = {
    invoices: [],
    payments: [],
    deposits: [],
    expenses: [],
    rent_plans: [],
  };

  for (const r of rolesData) {
    const token = createToken(r.userId, r.email);
    const headers = {
      'Authorization': `Bearer ${token}`,
      'X-Organization-Id': ORG_ID,
      'Content-Type': 'application/json',
    };

    // 1. GET /api/invoices
    const getInv = await fetch(`${BASE_URL}/invoices`, { headers });
    const expGetInv = r.isAuthorized ? 200 : 403;
    testResults.push({
      Role: r.role,
      Endpoint: 'GET /api/invoices',
      Expected: expGetInv,
      Actual: getInv.status,
      Status: getInv.status === expGetInv ? 'PASS' : 'FAIL',
    });

    // 2. POST /api/invoices
    let postInvStatus;
    if (r.isAuthorized) {
      const res = await fetch(`${BASE_URL}/invoices`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          propertyId: property.id,
          residentId: resident.id,
          billingPeriodStart: '2026-12-01',
          billingPeriodEnd: '2026-12-31',
          dueDate: '2026-12-05',
          baseRent: 5000,
          invoiceNumber: `INV-RBAC-${r.role}-${Date.now()}`
        })
      });
      postInvStatus = res.status;
      if (res.status === 201) {
        const d = await res.json();
        createdIds.invoices.push(d.data.id);
      }
    } else {
      const res = await fetch(`${BASE_URL}/invoices`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      postInvStatus = res.status;
    }
    const expPostInv = r.isAuthorized ? 201 : 403;
    testResults.push({
      Role: r.role,
      Endpoint: 'POST /api/invoices',
      Expected: expPostInv,
      Actual: postInvStatus,
      Status: postInvStatus === expPostInv ? 'PASS' : 'FAIL',
    });

    // 3. GET /api/payments
    const getPay = await fetch(`${BASE_URL}/payments`, { headers });
    const expGetPay = r.isAuthorized ? 200 : 403;
    testResults.push({
      Role: r.role,
      Endpoint: 'GET /api/payments',
      Expected: expGetPay,
      Actual: getPay.status,
      Status: getPay.status === expGetPay ? 'PASS' : 'FAIL',
    });

    // 4. POST /api/payments
    let postPayStatus;
    if (r.isAuthorized) {
      const res = await fetch(`${BASE_URL}/payments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          propertyId: property.id,
          residentId: resident.id,
          amount: 500,
          paymentMethod: 'CASH',
          referenceNumber: `PAY-RBAC-${r.role}-${Date.now()}`
        })
      });
      postPayStatus = res.status;
      if (res.status === 201) {
        const d = await res.json();
        createdIds.payments.push(d.data.id);
      }
    } else {
      const res = await fetch(`${BASE_URL}/payments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      postPayStatus = res.status;
    }
    const expPostPay = r.isAuthorized ? 201 : 403;
    testResults.push({
      Role: r.role,
      Endpoint: 'POST /api/payments',
      Expected: expPostPay,
      Actual: postPayStatus,
      Status: postPayStatus === expPostPay ? 'PASS' : 'FAIL',
    });

    // 5. GET /api/deposits
    const getDep = await fetch(`${BASE_URL}/deposits`, { headers });
    const expGetDep = r.isAuthorized ? 200 : 403;
    testResults.push({
      Role: r.role,
      Endpoint: 'GET /api/deposits',
      Expected: expGetDep,
      Actual: getDep.status,
      Status: getDep.status === expGetDep ? 'PASS' : 'FAIL',
    });

    // 6. POST /api/deposits
    let postDepStatus;
    if (r.isAuthorized) {
      const res = await fetch(`${BASE_URL}/deposits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          propertyId: property.id,
          residentId: resident.id,
          transactionType: 'COLLECTED',
          amount: 1000,
          paymentMethod: 'CASH',
          referenceNumber: `DEP-RBAC-${r.role}-${Date.now()}`
        })
      });
      postDepStatus = res.status;
      if (res.status === 201) {
        const d = await res.json();
        createdIds.deposits.push(d.data.id);
      }
    } else {
      const res = await fetch(`${BASE_URL}/deposits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      postDepStatus = res.status;
    }
    const expPostDep = r.isAuthorized ? 201 : 403;
    testResults.push({
      Role: r.role,
      Endpoint: 'POST /api/deposits',
      Expected: expPostDep,
      Actual: postDepStatus,
      Status: postDepStatus === expPostDep ? 'PASS' : 'FAIL',
    });

    // 7. GET /api/expenses
    const getExp = await fetch(`${BASE_URL}/expenses`, { headers });
    const expGetExp = r.isAuthorized ? 200 : 403;
    testResults.push({
      Role: r.role,
      Endpoint: 'GET /api/expenses',
      Expected: expGetExp,
      Actual: getExp.status,
      Status: getExp.status === expGetExp ? 'PASS' : 'FAIL',
    });

    // 8. POST /api/expenses
    let postExpStatus;
    if (r.isAuthorized) {
      const res = await fetch(`${BASE_URL}/expenses`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          propertyId: property.id,
          category: 'CLEANING_SUPPLIES',
          title: `Cleaning RBAC test ${r.role}`,
          amount: 350,
        })
      });
      postExpStatus = res.status;
      if (res.status === 201) {
        const d = await res.json();
        createdIds.expenses.push(d.data.id);
      }
    } else {
      const res = await fetch(`${BASE_URL}/expenses`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      postExpStatus = res.status;
    }
    const expPostExp = r.isAuthorized ? 201 : 403;
    testResults.push({
      Role: r.role,
      Endpoint: 'POST /api/expenses',
      Expected: expPostExp,
      Actual: postExpStatus,
      Status: postExpStatus === expPostExp ? 'PASS' : 'FAIL',
    });

    // 9. GET /api/rent-plans
    const getPlan = await fetch(`${BASE_URL}/rent-plans`, { headers });
    const expGetPlan = r.isAuthorized ? 200 : 403;
    testResults.push({
      Role: r.role,
      Endpoint: 'GET /api/rent-plans',
      Expected: expGetPlan,
      Actual: getPlan.status,
      Status: getPlan.status === expGetPlan ? 'PASS' : 'FAIL',
    });

    // 10. POST /api/rent-plans
    let postPlanStatus;
    if (r.isAuthorized) {
      const res = await fetch(`${BASE_URL}/rent-plans`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          propertyId: property.id,
          name: `RBAC Test Plan ${r.role} ${Date.now()}`,
          baseAmount: 6000,
          securityDeposit: 12000,
        })
      });
      postPlanStatus = res.status;
      if (res.status === 201) {
        const d = await res.json();
        createdIds.rent_plans.push(d.data.id);
      }
    } else {
      const res = await fetch(`${BASE_URL}/rent-plans`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      postPlanStatus = res.status;
    }
    const expPostPlan = r.isAuthorized ? 201 : 403;
    testResults.push({
      Role: r.role,
      Endpoint: 'POST /api/rent-plans',
      Expected: expPostPlan,
      Actual: postPlanStatus,
      Status: postPlanStatus === expPostPlan ? 'PASS' : 'FAIL',
    });
  }

  console.log('=== REAL RBAC REQUEST TEST RESULTS ===');
  console.table(testResults);

  // Clean up created test items so no unnecessary permanent test data remains
  console.log('\nCleaning up created test records...');
  if (createdIds.invoices.length > 0) {
    await prisma.invoices.deleteMany({ where: { id: { in: createdIds.invoices } } });
  }
  if (createdIds.payments.length > 0) {
    await prisma.payments.deleteMany({ where: { id: { in: createdIds.payments } } });
  }
  if (createdIds.deposits.length > 0) {
    await prisma.deposit_transactions.deleteMany({ where: { id: { in: createdIds.deposits } } });
  }
  if (createdIds.expenses.length > 0) {
    await prisma.expenses.deleteMany({ where: { id: { in: createdIds.expenses } } });
  }
  if (createdIds.rent_plans.length > 0) {
    await prisma.rent_plans.deleteMany({ where: { id: { in: createdIds.rent_plans } } });
  }
  console.log('Test records successfully cleaned up!');

  const failures = testResults.filter(t => t.Status === 'FAIL');
  console.log(`\nTotal Tests: ${testResults.length}, Passed: ${testResults.length - failures.length}, Failed: ${failures.length}`);
  if (failures.length > 0) {
    console.error('RBAC Test Failures:', failures);
    process.exit(1);
  }

  await prisma.$disconnect();
}

runRbacTests().catch(err => {
  console.error('Fatal RBAC test error:', err);
  process.exit(1);
});
