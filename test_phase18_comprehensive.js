const { PrismaClient } = require('./node_modules/@prisma/client');
const jwt = require('./node_modules/jsonwebtoken');
const fs = require('fs');
const { randomUUID } = require('crypto');

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
const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000';
const INVALID_UUID = 'not-a-valid-uuid';

const USERS = {
  OWNER: { email: 'owner@blrstays.com', userId: 'c9b7c9e5-a3f9-4072-89b8-f84cd21edd98' },
  MANAGER: { email: 'manager@blrstays.com', userId: 'cd01d46f-89e5-4ded-b3cb-590b3c47effa' },
  ACCOUNTANT: { email: 'accountant@blrstays.com', userId: 'e4af3ac7-d062-4dd4-90f3-2ba31213635a' },
  STAFF: { email: 'staff@blrstays.com', userId: '2f36f7ff-70da-453f-ba38-cd4f90be2035' },
  RESIDENT_A: { email: 'resident@blrstays.com', userId: '182f4fd2-5886-42f9-8bff-e6114e74f254' },
};

const tokens = {};
for (const [key, u] of Object.entries(USERS)) {
  tokens[key] = jwt.sign(
    { sub: u.userId, email: u.email, role: key === 'RESIDENT_A' ? 'RESIDENT' : key },
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
  console.log('PHASE 18 — TENANT PORTAL & RESIDENT SELF-SERVICE TESTS');
  console.log('====================================================\n');

  const createdRecordIds = {
    users: [],
    members: [],
    residents: [],
    invoices: [],
    payments: [],
    deposits: [],
    complaints: [],
    maintenance: [],
    notifications: [],
    visitors: [],
    documents: [],
    bookings: [],
    moveIns: [],
    moveOuts: [],
    residentStays: [],
  };

  let tokenB = '';
  let residentAId = 'b0b3b1c3-8c53-402a-bedf-8f2e3f0b45fa';
  let residentBId = '';
  let userBId = '';

  let invoiceAId = '';
  let invoiceBId = '';
  let paymentAId = '';
  let paymentBId = '';
  let complaintAId = '';
  let complaintBId = '';
  let maintenanceAId = '';
  let maintenanceBId = '';
  let notifAId = '';
  let notifBId = '';
  let visitorBId = '';
  let leaveBId = '';

  try {
    console.log('--- Setting up isolated Resident B fixtures ---');
    const residentRole = await prisma.roles.findFirst({ where: { name: 'RESIDENT' } });

    userBId = randomUUID();
    const userBEmail = `residentB_${Date.now()}@blrstays.com`;
    await prisma.users.create({
      data: {
        id: userBId,
        email: userBEmail,
        passwordHash: '$2b$10$ER727ofS2IvVbx0jG1Xr0O/Ck4EAnaXhI7nUZ09FS7PAA9G0soBtK',
        firstName: 'ResidentB',
        lastName: 'Tester',
        phone: '+91 91234 56789',
        isActive: true,
        updatedAt: new Date(),
      },
    });
    createdRecordIds.users.push(userBId);

    const memberBId = randomUUID();
    await prisma.organization_members.create({
      data: {
        id: memberBId,
        organizationId: ORG_ID,
        userId: userBId,
        roleId: residentRole.id,
        isPrimaryOwner: false,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.members.push(memberBId);

    residentBId = randomUUID();
    await prisma.residents.create({
      data: {
        id: residentBId,
        organizationId: ORG_ID,
        userId: userBId,
        propertyId: PROPERTY_ID,
        fullName: 'Resident B Profile',
        email: userBEmail,
        phone: '+91 91234 56789',
        gender: 'BOYS',
        status: 'ACTIVE',
        monthlyRent: 9500,
        securityDeposit: 15000,
        updatedAt: new Date(),
      },
    });
    createdRecordIds.residents.push(residentBId);

    tokenB = jwt.sign(
      { sub: userBId, email: userBEmail, role: 'RESIDENT' },
      jwtSecret,
      { expiresIn: '1h' },
    );

    const stayAId = randomUUID();
    await prisma.resident_stays.create({
      data: {
        id: stayAId,
        organizationId: ORG_ID,
        residentId: residentAId,
        propertyId: PROPERTY_ID,
        status: 'ACTIVE',
        checkInDate: new Date('2026-10-01'),
        expectedCheckOutDate: new Date('2027-10-01'),
        monthlyRent: 9000,
        securityDeposit: 15000,
        updatedAt: new Date(),
      },
    });
    createdRecordIds.residentStays.push(stayAId);

    invoiceAId = randomUUID();
    await prisma.invoices.create({
      data: {
        id: invoiceAId,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        residentId: residentAId,
        invoiceNumber: `INV-A-${Date.now()}`,
        billingPeriodStart: new Date('2026-10-01'),
        billingPeriodEnd: new Date('2026-10-31'),
        dueDate: new Date('2026-10-10'),
        baseRent: 9000,
        netPayable: 9000,
        paidAmount: 0,
        outstandingAmount: 9000,
        status: 'ISSUED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.invoices.push(invoiceAId);

    invoiceBId = randomUUID();
    await prisma.invoices.create({
      data: {
        id: invoiceBId,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        residentId: residentBId,
        invoiceNumber: `INV-B-${Date.now()}`,
        billingPeriodStart: new Date('2026-10-01'),
        billingPeriodEnd: new Date('2026-10-31'),
        dueDate: new Date('2026-10-10'),
        baseRent: 9500,
        netPayable: 9500,
        paidAmount: 0,
        outstandingAmount: 9500,
        status: 'ISSUED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.invoices.push(invoiceBId);

    paymentAId = randomUUID();
    await prisma.payments.create({
      data: {
        id: paymentAId,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        residentId: residentAId,
        receiptNumber: `REC-A-${Date.now()}`,
        amount: 9000,
        paymentMethod: 'UPI',
        status: 'RECORDED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.payments.push(paymentAId);

    paymentBId = randomUUID();
    await prisma.payments.create({
      data: {
        id: paymentBId,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        residentId: residentBId,
        receiptNumber: `REC-B-${Date.now()}`,
        amount: 9500,
        paymentMethod: 'UPI',
        status: 'RECORDED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.payments.push(paymentBId);

    const depTxId = randomUUID();
    await prisma.deposit_transactions.create({
      data: {
        id: depTxId,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        residentId: residentAId,
        transactionType: 'COLLECTED',
        amount: 15000,
        paymentMethod: 'UPI',
      },
    });
    createdRecordIds.deposits.push(depTxId);

    notifAId = randomUUID();
    await prisma.notifications.create({
      data: {
        id: notifAId,
        organizationId: ORG_ID,
        userId: USERS.RESIDENT_A.userId,
        type: 'RENT_DUE',
        channel: 'IN_APP',
        title: 'Monthly Rent Notice',
        body: 'Rent is due on 10th of this month',
        status: 'SENT',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.notifications.push(notifAId);

    notifBId = randomUUID();
    await prisma.notifications.create({
      data: {
        id: notifBId,
        organizationId: ORG_ID,
        userId: userBId,
        type: 'MAINTENANCE_CREATED',
        channel: 'IN_APP',
        title: 'Resident B Notification',
        body: 'Private notice for B',
        status: 'SENT',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.notifications.push(notifBId);

    visitorBId = randomUUID();
    await prisma.visitors.create({
      data: {
        id: visitorBId,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        residentId: residentBId,
        visitorName: 'Visitor of Resident B',
        phone: '+919876543299',
        purpose: 'FRIEND_VISIT',
        status: 'EXPECTED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.visitors.push(visitorBId);

    complaintBId = randomUUID();
    await prisma.complaints.create({
      data: {
        id: complaintBId,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        residentId: residentBId,
        ticketNumber: `CMP-B-${Date.now()}`,
        subject: 'Resident B Private Complaint',
        description: 'Issue strictly belonging to Resident B',
        category: 'ROOMMATE_ISSUE',
        priority: 'MEDIUM',
        status: 'SUBMITTED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.complaints.push(complaintBId);

    maintenanceBId = randomUUID();
    await prisma.maintenance_requests.create({
      data: {
        id: maintenanceBId,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        residentId: residentBId,
        ticketNumber: `MNT-B-${Date.now()}`,
        title: 'Resident B Private Maintenance',
        description: 'Leak in resident B room',
        category: 'PLUMBING',
        priority: 'MEDIUM',
        status: 'CREATED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.maintenance.push(maintenanceBId);

    const docAId = randomUUID();
    await prisma.resident_documents.create({
      data: {
        id: docAId,
        organizationId: ORG_ID,
        residentId: residentAId,
        documentType: 'AADHAAR_CARD',
        documentNumber: 'XXXX-XXXX-1234',
        fileName: 'aadhaar_front.pdf',
        fileUrl: 'https://storage.example.com/docs/aadhaar.pdf',
        verificationStatus: 'VERIFIED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.documents.push(docAId);

    const room = await prisma.rooms.findFirst({ where: { propertyId: PROPERTY_ID } });
    const bed = await prisma.beds.findFirst({ where: { propertyId: PROPERTY_ID } });
    const bookingAId = randomUUID();
    await prisma.bookings.create({
      data: {
        id: bookingAId,
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        roomId: room.id,
        bedId: bed.id,
        residentId: residentAId,
        bookingAmount: 5000,
        expectedMoveIn: new Date('2026-10-01'),
        receiptNumber: `BKG-A-${Date.now()}`,
        status: 'CONFIRMED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.bookings.push(bookingAId);

    const moveInAId = randomUUID();
    await prisma.move_ins.create({
      data: {
        id: moveInAId,
        organizationId: ORG_ID,
        residentId: residentAId,
        propertyId: PROPERTY_ID,
        bedId: bed.id,
        securityDepositAmount: 15000,
        depositPaid: 15000,
        firstInvoiceAmount: 9000,
        firstInvoicePaid: true,
        status: 'COMPLETED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.moveIns.push(moveInAId);

    const moveOutAId = randomUUID();
    await prisma.move_outs.create({
      data: {
        id: moveOutAId,
        organizationId: ORG_ID,
        residentId: residentAId,
        propertyId: PROPERTY_ID,
        noticeDate: new Date('2026-10-01'),
        plannedMoveOut: new Date('2026-10-31'),
        totalDepositHeld: 15000,
        refundAmount: 15000,
        status: 'NOTICE_SUBMITTED',
        updatedAt: new Date(),
      },
    });
    createdRecordIds.moveOuts.push(moveOutAId);

    console.log('\n--- SECTION A: Authentication & Tokens ---');
    assert(Boolean(tokens.RESIDENT_A), 'RESIDENT_A token successfully signed');
    assert(Boolean(tokenB), 'RESIDENT_B token successfully signed');
    assert(Boolean(tokens.OWNER), 'OWNER token successfully signed');

    console.log('\n--- SECTION B: Resident Identity Resolution ---');
    const profA = await request('GET', '/portal/profile', null, tokens.RESIDENT_A);
    assert(profA.status === 200, 'GET /portal/profile returns 200 for RESIDENT_A');
    assert(profA.data?.data?.id === residentAId, 'Authenticated JWT accurately determines Resident A identity');
    assert(profA.data?.data?.email === USERS.RESIDENT_A.email, 'Profile matches authenticated user email');

    const profB = await request('GET', '/portal/profile', null, tokenB);
    assert(profB.status === 200, 'GET /portal/profile returns 200 for RESIDENT_B');
    assert(profB.data?.data?.id === residentBId, 'Authenticated JWT accurately determines Resident B identity');

    const forgedQuery = await request('GET', `/portal/profile?residentId=${residentBId}`, null, tokens.RESIDENT_A);
    assert(forgedQuery.status === 200 && forgedQuery.data?.data?.id === residentAId, 'Query parameter ?residentId cannot override identity');

    console.log('\n--- SECTION C: Resident Profile ---');
    const safeData = profA.data?.data || {};
    assert(safeData.organizationId === undefined, 'Profile response NEVER leaks organizationId');
    assert(safeData.passwordHash === undefined, 'Profile response NEVER leaks passwordHash');
    assert(safeData.idNumber === undefined, 'Profile response does not expose sensitive KYC idNumber');
    assert(safeData.monthlyRent === undefined, 'Profile response does not expose financial fields');
    assert(safeData.deletedAt === undefined, 'Profile response does not expose internal deletedAt');

    const patchRes = await request('PATCH', '/portal/profile', {
      city: 'Bengaluru Silicon Hub',
      emergencyContactName: 'Vikram Sharma',
      occupationType: 'EMPLOYED',
    }, tokens.RESIDENT_A);
    assert(patchRes.status === 200, 'PATCH /portal/profile successfully updates allowed self-service fields');
    assert(patchRes.data?.data?.city === 'Bengaluru Silicon Hub', 'Updated city confirmed in response');
    assert(patchRes.data?.data?.emergencyContactName === 'Vikram Sharma', 'Updated emergency contact confirmed');

    const illegalPatch = await request('PATCH', '/portal/profile', {
      organizationId: '11111111-1111-4111-a111-111111111111',
      status: 'MOVED_OUT',
      monthlyRent: 1,
    }, tokens.RESIDENT_A);
    assert(illegalPatch.status === 400, 'PATCH /portal/profile strictly rejects organizationId and status tampering (400)');

    console.log('\n--- SECTION D: Current Stay ---');
    const stayRes = await request('GET', '/portal/stay', null, tokens.RESIDENT_A);
    assert(stayRes.status === 200, 'GET /portal/stay returns 200 for active resident');
    const stayData = stayRes.data?.data || {};
    assert(stayData.id === stayAId, 'Stay matches active resident stay ID');
    assert(stayData.property?.id === PROPERTY_ID, 'Stay includes safe property info');
    assert(typeof stayData.monthlyRent === 'number', 'Stay reports monthlyRent numeric amount');
    assert(stayData.organizationId === undefined, 'Stay response does not expose internal organizationId');

    console.log('\n--- SECTION E: Accommodation ---');
    const accomRes = await request('GET', '/portal/accommodation', null, tokens.RESIDENT_A);
    assert(accomRes.status === 200, 'GET /portal/accommodation returns 200');
    const accomData = accomRes.data?.data || {};
    assert(accomData.property?.id === PROPERTY_ID, 'Accommodation returns property info');
    assert(accomData.room !== undefined, 'Accommodation returns room info');
    assert(accomData.bed !== undefined, 'Accommodation returns bed info');

    console.log('\n--- SECTION F & G: Invoices & Invoice Ownership ---');
    const invoicesList = await request('GET', '/portal/invoices', null, tokens.RESIDENT_A);
    assert(invoicesList.status === 200, 'GET /portal/invoices returns 200');
    assert(Array.isArray(invoicesList.data?.data?.items), 'Invoices response contains items array');
    const invAFound = invoicesList.data?.data?.items.find(i => i.id === invoiceAId);
    assert(Boolean(invAFound), 'Resident A can see own invoice');
    const invBFoundInA = invoicesList.data?.data?.items.find(i => i.id === invoiceBId);
    assert(!invBFoundInA, 'Resident A CANNOT see Resident B invoice in list');

    const invAGet = await request('GET', `/portal/invoices/${invoiceAId}`, null, tokens.RESIDENT_A);
    assert(invAGet.status === 200, 'GET /portal/invoices/:id returns 200 for own invoice');
    assert(invAGet.data?.data?.id === invoiceAId, 'Invoice detail matches requested invoice ID');

    const invCrossGet = await request('GET', `/portal/invoices/${invoiceBId}`, null, tokens.RESIDENT_A);
    assert(invCrossGet.status === 404, 'Resident A attempting to view Resident B invoice is rejected with 404');

    console.log('\n--- SECTION H & I: Payments & Payment Ownership ---');
    const paymentsList = await request('GET', '/portal/payments', null, tokens.RESIDENT_A);
    assert(paymentsList.status === 200, 'GET /portal/payments returns 200');
    const payAFound = paymentsList.data?.data?.items.find(p => p.id === paymentAId);
    assert(Boolean(payAFound), 'Resident A sees own payment');
    const payBFoundInA = paymentsList.data?.data?.items.find(p => p.id === paymentBId);
    assert(!payBFoundInA, 'Resident A CANNOT see Resident B payment in list');

    const payAGet = await request('GET', `/portal/payments/${paymentAId}`, null, tokens.RESIDENT_A);
    assert(payAGet.status === 200, 'GET /portal/payments/:id returns 200 for own payment');

    const payCrossGet = await request('GET', `/portal/payments/${paymentBId}`, null, tokens.RESIDENT_A);
    assert(payCrossGet.status === 404, 'Resident A attempting to view Resident B payment is rejected with 404');

    console.log('\n--- SECTION J: Security Deposit ---');
    const depRes = await request('GET', '/portal/deposit', null, tokens.RESIDENT_A);
    assert(depRes.status === 200, 'GET /portal/deposit returns 200');
    const depData = depRes.data?.data || {};
    assert(depData.totalCollected >= 15000, 'Deposit totalCollected accurately calculated');
    assert(typeof depData.totalRefunded === 'number', 'Deposit totalRefunded returned as number');
    assert(typeof depData.totalDeducted === 'number', 'Deposit totalDeducted returned as number');
    assert(typeof depData.currentBalance === 'number', 'Deposit currentBalance returned as number');
    assert(Array.isArray(depData.transactions), 'Deposit includes transactions array');

    console.log('\n--- SECTION K: Notices ---');
    const noticesRes = await request('GET', '/portal/notices', null, tokens.RESIDENT_A);
    assert(noticesRes.status === 200, 'GET /portal/notices returns 200 for resident');
    assert(Array.isArray(noticesRes.data?.data?.items), 'Notices returns items array');
    const noticesItems = noticesRes.data?.data?.items || [];
    assert(noticesItems.every(n => n.status === 'PUBLISHED'), 'Resident only sees PUBLISHED notices');

    console.log('\n--- SECTION L: Notifications ---');
    const notifsList = await request('GET', '/portal/notifications', null, tokens.RESIDENT_A);
    assert(notifsList.status === 200, 'GET /portal/notifications returns 200');
    const notifAFound = notifsList.data?.data?.items.find(n => n.id === notifAId);
    assert(Boolean(notifAFound), 'User A sees own notification');
    const notifBFoundInA = notifsList.data?.data?.items.find(n => n.id === notifBId);
    assert(!notifBFoundInA, 'User A CANNOT see User B notification');

    const unreadCount = await request('GET', '/portal/notifications/unread-count', null, tokens.RESIDENT_A);
    assert(unreadCount.status === 200, 'GET /portal/notifications/unread-count returns 200');

    const markReadRes = await request('PATCH', `/portal/notifications/${notifAId}/read`, null, tokens.RESIDENT_A);
    assert(markReadRes.status === 200, 'PATCH /portal/notifications/:id/read returns 200 for own notification');

    const crossNotifRead = await request('PATCH', `/portal/notifications/${notifBId}/read`, null, tokens.RESIDENT_A);
    assert(crossNotifRead.status === 404, 'Resident A marking Resident B notification as read is rejected with 404');

    const readAllRes = await request('POST', '/portal/notifications/read-all', {}, tokens.RESIDENT_A);
    assert(readAllRes.status === 200, 'POST /portal/notifications/read-all returns 200');

    console.log('\n--- SECTION M: Complaints ---');
    const complaintCreateRes = await request('POST', '/portal/complaints', {
      subject: 'Portal test complaint Wifi issue',
      description: 'Wifi router on 1st floor restarting intermittently',
      category: 'OTHER',
      priority: 'MEDIUM',
    }, tokens.RESIDENT_A);
    assert(complaintCreateRes.status === 201, 'POST /portal/complaints creates complaint (201)');
    complaintAId = complaintCreateRes.data?.data?.id;
    if (complaintAId) createdRecordIds.complaints.push(complaintAId);
    assert(Boolean(complaintAId), 'Complaint ticket created with UUID');

    const complaintsList = await request('GET', '/portal/complaints', null, tokens.RESIDENT_A);
    assert(complaintsList.status === 200, 'GET /portal/complaints returns 200');
    assert(complaintsList.data?.data?.items.some(c => c.id === complaintAId), 'Resident sees newly created complaint');
    assert(!complaintsList.data?.data?.items.some(c => c.id === complaintBId), 'Resident A CANNOT see Resident B complaint in list');

    const compAGet = await request('GET', `/portal/complaints/${complaintAId}`, null, tokens.RESIDENT_A);
    assert(compAGet.status === 200, 'GET /portal/complaints/:id returns 200 for own complaint');

    const compCrossGet = await request('GET', `/portal/complaints/${complaintBId}`, null, tokens.RESIDENT_A);
    assert(compCrossGet.status === 404, 'Resident A viewing Resident B complaint returns 404');

    const compHist = await request('GET', `/portal/complaints/${complaintAId}/history`, null, tokens.RESIDENT_A);
    assert(compHist.status === 200, 'GET /portal/complaints/:id/history returns 200');

    console.log('\n--- SECTION N: Maintenance Requests ---');
    const maintCreateRes = await request('POST', '/portal/maintenance', {
      title: 'Portal water leak in washroom',
      description: 'Water tap leaking below sink',
      category: 'PLUMBING',
      priority: 'MEDIUM',
    }, tokens.RESIDENT_A);
    assert(maintCreateRes.status === 201, 'POST /portal/maintenance creates maintenance request (201)');
    maintenanceAId = maintCreateRes.data?.data?.id;
    if (maintenanceAId) createdRecordIds.maintenance.push(maintenanceAId);
    assert(Boolean(maintenanceAId), 'Maintenance request created with UUID');

    const maintList = await request('GET', '/portal/maintenance', null, tokens.RESIDENT_A);
    assert(maintList.status === 200, 'GET /portal/maintenance returns 200');

    const maintAGet = await request('GET', `/portal/maintenance/${maintenanceAId}`, null, tokens.RESIDENT_A);
    assert(maintAGet.status === 200, 'GET /portal/maintenance/:id returns 200 for own request');

    const maintCrossGet = await request('GET', `/portal/maintenance/${maintenanceBId}`, null, tokens.RESIDENT_A);
    assert(maintCrossGet.status === 404, 'Resident A viewing Resident B maintenance returns 404');

    console.log('\n--- SECTION O: Leave Management ---');
    const leaveCreateRes = await request('POST', '/portal/leaves', {
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      reason: 'Diwali celebration at home',
      optOutMeals: true,
    }, tokens.RESIDENT_A);
    assert(leaveCreateRes.status === 201, 'POST /portal/leaves creates leave application (201)');
    const leaveAId = leaveCreateRes.data?.data?.id;

    const leaveBCreate = await request('POST', '/portal/leaves', {
      startDate: '2026-11-10',
      endDate: '2026-11-15',
      reason: 'Resident B family wedding',
      optOutMeals: true,
    }, tokenB);
    assert(leaveBCreate.status === 201, 'Resident B creates leave application (201)');
    leaveBId = leaveBCreate.data?.data?.id;

    const leavesList = await request('GET', '/portal/leaves', null, tokens.RESIDENT_A);
    assert(leavesList.status === 200, 'GET /portal/leaves returns 200');
    assert(leavesList.data?.data?.items.some(l => l.id === leaveAId), 'Resident sees own leave');
    assert(!leavesList.data?.data?.items.some(l => l.id === leaveBId), 'Resident A CANNOT see Resident B leave in list');

    const leaveAGet = await request('GET', `/portal/leaves/${leaveAId}`, null, tokens.RESIDENT_A);
    assert(leaveAGet.status === 200, 'GET /portal/leaves/:id returns 200 for own leave');

    const leaveCrossGet = await request('GET', `/portal/leaves/${leaveBId}`, null, tokens.RESIDENT_A);
    assert(leaveCrossGet.status === 404, 'Resident A viewing Resident B leave returns 404');

    const cancelRes = await request('POST', `/portal/leaves/${leaveAId}/cancel`, {}, tokens.RESIDENT_A);
    assert(cancelRes.status === 200, 'POST /portal/leaves/:id/cancel cancels own eligible leave (200)');

    const crossCancelRes = await request('POST', `/portal/leaves/${leaveBId}/cancel`, {}, tokens.RESIDENT_A);
    assert(crossCancelRes.status === 404, 'Resident A attempting to cancel Resident B leave returns 404');

    console.log('\n--- SECTION P, Q, R: Food & Mess ---');
    const foodMenuRes = await request('GET', '/portal/food/menu', null, tokens.RESIDENT_A);
    assert(foodMenuRes.status === 200, 'GET /portal/food/menu returns 200');

    const foodMealsRes = await request('GET', '/portal/food/meals', null, tokens.RESIDENT_A);
    assert(foodMealsRes.status === 200, 'GET /portal/food/meals returns 200');

    const foodAttRes = await request('GET', '/portal/food/attendance', null, tokens.RESIDENT_A);
    assert(foodAttRes.status === 200, 'GET /portal/food/attendance returns 200');
    assert(Array.isArray(foodAttRes.data?.data?.items), 'Food attendance returns items array');

    console.log('\n--- SECTION S: Visitors ---');
    const visList = await request('GET', '/portal/visitors', null, tokens.RESIDENT_A);
    assert(visList.status === 200, 'GET /portal/visitors returns 200');
    assert(!visList.data?.data?.items?.some(v => v.id === visitorBId), 'Resident A CANNOT see Resident B visitor');

    const visCrossGet = await request('GET', `/portal/visitors/${visitorBId}`, null, tokens.RESIDENT_A);
    assert(visCrossGet.status === 404, 'Resident A viewing Resident B visitor returns 404');

    console.log('\n--- SECTION T: Documents ---');
    const docsRes = await request('GET', '/portal/documents', null, tokens.RESIDENT_A);
    assert(docsRes.status === 200, 'GET /portal/documents returns 200');
    assert(Array.isArray(docsRes.data?.data), 'Documents returns array');
    assert(docsRes.data?.data?.some(d => d.id === docAId), 'Resident sees own uploaded document');

    console.log('\n--- SECTION U, V, W: Bookings, Move-ins, Move-outs ---');
    const bkgsRes = await request('GET', '/portal/bookings', null, tokens.RESIDENT_A);
    assert(bkgsRes.status === 200, 'GET /portal/bookings returns 200');

    const moveInsRes = await request('GET', '/portal/move-ins', null, tokens.RESIDENT_A);
    assert(moveInsRes.status === 200, 'GET /portal/move-ins returns 200');

    const moveOutsRes = await request('GET', '/portal/move-outs', null, tokens.RESIDENT_A);
    assert(moveOutsRes.status === 200, 'GET /portal/move-outs returns 200');

    console.log('\n--- SECTION X: Portal Dashboard ---');
    const dashRes = await request('GET', '/portal/dashboard', null, tokens.RESIDENT_A);
    assert(dashRes.status === 200, 'GET /portal/dashboard returns 200');
    const dashData = dashRes.data?.data || {};
    assert(Boolean(dashData.profile), 'Dashboard contains resident profile');
    assert(Boolean(dashData.currentAccommodation), 'Dashboard contains current accommodation');
    assert(typeof dashData.outstandingBalance === 'number', 'Dashboard contains numeric outstandingBalance');
    assert(Array.isArray(dashData.recentInvoices), 'Dashboard contains recentInvoices array');
    assert(Array.isArray(dashData.recentPayments), 'Dashboard contains recentPayments array');
    assert(typeof dashData.depositBalance === 'number', 'Dashboard contains depositBalance');
    assert(typeof dashData.unreadNotificationsCount === 'number', 'Dashboard contains unreadNotificationsCount');
    assert(typeof dashData.openComplaintsCount === 'number', 'Dashboard contains openComplaintsCount');
    assert(typeof dashData.activeMaintenanceCount === 'number', 'Dashboard contains activeMaintenanceCount');
    assert(Array.isArray(dashData.leaveStatus), 'Dashboard contains leaveStatus array');

    console.log('\n--- SECTION Y: RBAC ---');
    const ownerGhostPortal = await request('GET', '/portal/profile', null, tokens.OWNER);
    assert(ownerGhostPortal.status === 404, 'User without linked resident record receives 404');

    console.log('\n--- SECTION Z: Multi-Tenant & Organization Isolation ---');
    const crossOrgReq = await request('GET', '/portal/profile', null, tokens.RESIDENT_A, CROSS_ORG_ID);
    assert(crossOrgReq.status === 403, 'Cross-organization request is forbidden (403)');

    const missingOrgReq = await request('GET', '/portal/profile', null, tokens.RESIDENT_A, null);
    assert(missingOrgReq.status === 400, 'Request without X-Organization-Id returns 400');

    const malformedOrgReq = await request('GET', '/portal/profile', null, tokens.RESIDENT_A, INVALID_UUID);
    assert(malformedOrgReq.status === 400, 'Request with invalid UUID X-Organization-Id returns 400');

    console.log('\n--- SECTION AA: Property Isolation ---');
    const mismatchedComp = await request('POST', '/portal/complaints', {
      propertyId: NON_EXISTENT_UUID,
      subject: 'Mismatched property complaint',
      description: 'Should be prevented or scoped',
    }, tokens.RESIDENT_A);
    assert(mismatchedComp.status === 201 || mismatchedComp.status === 400, 'Property assignment tampering prevented');
    if (mismatchedComp.status === 201) {
      assert(mismatchedComp.data?.data?.propertyId === PROPERTY_ID, 'Complaint strictly scoped to resident assigned property');
      createdRecordIds.complaints.push(mismatchedComp.data?.data?.id);
    }

    console.log('\n--- SECTION AB: Resident-to-Resident Complete Isolation ---');
    assert((await request('GET', `/portal/invoices/${invoiceBId}`, null, tokens.RESIDENT_A)).status === 404, 'Isolation: invoice');
    assert((await request('GET', `/portal/payments/${paymentBId}`, null, tokens.RESIDENT_A)).status === 404, 'Isolation: payment');
    assert((await request('GET', `/portal/complaints/${complaintBId}`, null, tokens.RESIDENT_A)).status === 404, 'Isolation: complaint');
    assert((await request('GET', `/portal/complaints/${complaintBId}/history`, null, tokens.RESIDENT_A)).status === 404, 'Isolation: complaint history');
    assert((await request('GET', `/portal/maintenance/${maintenanceBId}`, null, tokens.RESIDENT_A)).status === 404, 'Isolation: maintenance');
    assert((await request('GET', `/portal/maintenance/${maintenanceBId}/history`, null, tokens.RESIDENT_A)).status === 404, 'Isolation: maintenance history');
    assert((await request('GET', `/portal/leaves/${leaveBId}`, null, tokens.RESIDENT_A)).status === 404, 'Isolation: leave');
    assert((await request('POST', `/portal/leaves/${leaveBId}/cancel`, {}, tokens.RESIDENT_A)).status === 404, 'Isolation: leave cancel');
    assert((await request('GET', `/portal/visitors/${visitorBId}`, null, tokens.RESIDENT_A)).status === 404, 'Isolation: visitor');
    assert((await request('PATCH', `/portal/notifications/${notifBId}/read`, null, tokens.RESIDENT_A)).status === 404, 'Isolation: notification read');

    console.log('\n--- SECTION AC: Invalid UUID Validation ---');
    assert((await request('GET', `/portal/invoices/${INVALID_UUID}`, null, tokens.RESIDENT_A)).status === 400, 'Invalid UUID invoice returns 400');
    assert((await request('GET', `/portal/payments/${INVALID_UUID}`, null, tokens.RESIDENT_A)).status === 400, 'Invalid UUID payment returns 400');
    assert((await request('GET', `/portal/complaints/${INVALID_UUID}`, null, tokens.RESIDENT_A)).status === 400, 'Invalid UUID complaint returns 400');
    assert((await request('GET', `/portal/maintenance/${INVALID_UUID}`, null, tokens.RESIDENT_A)).status === 400, 'Invalid UUID maintenance returns 400');
    assert((await request('GET', `/portal/leaves/${INVALID_UUID}`, null, tokens.RESIDENT_A)).status === 400, 'Invalid UUID leave returns 400');
    assert((await request('GET', `/portal/visitors/${INVALID_UUID}`, null, tokens.RESIDENT_A)).status === 400, 'Invalid UUID visitor returns 400');

    console.log('\n--- SECTION AD: Validation Pipe ---');
    const badComplaint = await request('POST', '/portal/complaints', {
      subject: '',
      description: 'Missing subject test',
    }, tokens.RESIDENT_A);
    assert(badComplaint.status === 400, 'Empty complaint subject returns 400');

    const badLeave = await request('POST', '/portal/leaves', {
      startDate: 'invalid-date',
      endDate: '2026-11-05',
      reason: 'Bad date test',
    }, tokens.RESIDENT_A);
    assert(badLeave.status === 400, 'Invalid ISO date string returns 400');

    const badProfilePhone = await request('PATCH', '/portal/profile', {
      phone: 'not-a-phone-1234567890123456789012345',
    }, tokens.RESIDENT_A);
    assert(badProfilePhone.status === 400, 'Malformed phone string rejected with 400');

    console.log('\n--- SECTION AE: Missing & Invalid JWT ---');
    assert((await request('GET', '/portal/profile', null, null)).status === 401, 'Missing Authorization header returns 401');
    assert((await request('GET', '/portal/profile', null, 'invalid.jwt.token')).status === 401, 'Forged JWT token returns 401');

    console.log('\n--- SECTION AF: Missing Organization Header ---');
    assert((await request('GET', '/portal/dashboard', null, tokens.RESIDENT_A, null)).status === 400, 'Missing X-Organization-Id returns 400');

    console.log('\n--- SECTION AG: Inactive Membership ---');
    const forgedToken = jwt.sign(
      { sub: NON_EXISTENT_UUID, email: 'ghost@example.com', role: 'RESIDENT' },
      jwtSecret,
      { expiresIn: '1h' },
    );
    assert((await request('GET', '/portal/profile', null, forgedToken)).status === 401, 'Non-existent user token returns 401');

    console.log('\n--- SECTION AH: Audit Logging ---');
    const auditLogs = await prisma.audit_logs.findMany({
      where: {
        organizationId: ORG_ID,
        action: {
          in: [
            'portal.profile.updated',
            'portal.complaint.created',
            'portal.maintenance.created',
            'portal.leave.created',
            'portal.leave.cancelled',
            'portal.notification.read',
            'portal.notification.read_all',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    assert(auditLogs.length > 0, 'Portal audit logs successfully recorded');
    assert(auditLogs.some(l => l.action === 'portal.profile.updated'), 'portal.profile.updated audit event recorded');
    assert(auditLogs.some(l => l.action === 'portal.complaint.created'), 'portal.complaint.created audit event recorded');
    assert(auditLogs.some(l => l.action === 'portal.maintenance.created'), 'portal.maintenance.created audit event recorded');
    assert(auditLogs.some(l => l.action === 'portal.leave.created'), 'portal.leave.created audit event recorded');
    assert(auditLogs.some(l => l.action === 'portal.leave.cancelled'), 'portal.leave.cancelled audit event recorded');
    assert(auditLogs.some(l => l.action === 'portal.notification.read'), 'portal.notification.read audit event recorded');
    assert(auditLogs.every(l => !l.newValues || (!l.newValues.includes('password') && !l.newValues.includes('secret'))), 'Portal audit logs never leak secrets');

    console.log('\n--- SECTION AI: Concurrency ---');
    const concurrentProfiles = await Promise.all([
      request('PATCH', '/portal/profile', { emergencyContactRelation: 'Brother' }, tokens.RESIDENT_A),
      request('PATCH', '/portal/profile', { emergencyContactRelation: 'Father' }, tokens.RESIDENT_A),
      request('PATCH', '/portal/profile', { emergencyContactRelation: 'Mother' }, tokens.RESIDENT_A),
    ]);
    assert(concurrentProfiles.every(r => r.status === 200), 'Concurrent profile updates succeed cleanly');

    const concurrentComplaints = await Promise.all([
      request('POST', '/portal/complaints', { subject: 'Concurrent complaint 1', description: 'desc 1' }, tokens.RESIDENT_A),
      request('POST', '/portal/complaints', { subject: 'Concurrent complaint 2', description: 'desc 2' }, tokens.RESIDENT_A),
    ]);
    assert(concurrentComplaints.every(r => r.status === 201), 'Concurrent complaint creations succeed cleanly');
    concurrentComplaints.forEach(r => {
      if (r.data?.data?.id) createdRecordIds.complaints.push(r.data.data.id);
    });

    console.log('\n--- SECTION AJ: Performance & Query Safety ---');
    const tStart = Date.now();
    const dashPerf = await request('GET', '/portal/dashboard', null, tokens.RESIDENT_A);
    const tElapsed = Date.now() - tStart;
    assert(dashPerf.status === 200, 'GET /portal/dashboard succeeds');
    assert(tElapsed < 1500, `Portal dashboard response time (${tElapsed}ms) is well under 1500ms SLA`);

  } finally {
    console.log('\n--- Cleaning up temporary test records ---');
    try {
      if (createdRecordIds.complaints.length > 0) {
        await prisma.complaint_history.deleteMany({
          where: { complaintId: { in: createdRecordIds.complaints } },
        });
        await prisma.complaints.deleteMany({
          where: { id: { in: createdRecordIds.complaints } },
        });
      }
      if (createdRecordIds.maintenance.length > 0) {
        await prisma.maintenance_history.deleteMany({
          where: { maintenanceRequestId: { in: createdRecordIds.maintenance } },
        });
        await prisma.maintenance_requests.deleteMany({
          where: { id: { in: createdRecordIds.maintenance } },
        });
      }
      if (createdRecordIds.visitors.length > 0) {
        await prisma.visitors.deleteMany({
          where: { id: { in: createdRecordIds.visitors } },
        });
      }
      if (createdRecordIds.documents.length > 0) {
        await prisma.resident_documents.deleteMany({
          where: { id: { in: createdRecordIds.documents } },
        });
      }
      if (createdRecordIds.invoices.length > 0) {
        await prisma.invoices.deleteMany({
          where: { id: { in: createdRecordIds.invoices } },
        });
      }
      if (createdRecordIds.payments.length > 0) {
        await prisma.payments.deleteMany({
          where: { id: { in: createdRecordIds.payments } },
        });
      }
      if (createdRecordIds.deposits.length > 0) {
        await prisma.deposit_transactions.deleteMany({
          where: { id: { in: createdRecordIds.deposits } },
        });
      }
      if (createdRecordIds.notifications.length > 0) {
        await prisma.notifications.deleteMany({
          where: { id: { in: createdRecordIds.notifications } },
        });
      }
      if (createdRecordIds.bookings.length > 0) {
        await prisma.bookings.deleteMany({
          where: { id: { in: createdRecordIds.bookings } },
        });
      }
      if (createdRecordIds.moveIns.length > 0) {
        await prisma.move_ins.deleteMany({
          where: { id: { in: createdRecordIds.moveIns } },
        });
      }
      if (createdRecordIds.moveOuts.length > 0) {
        await prisma.move_outs.deleteMany({
          where: { id: { in: createdRecordIds.moveOuts } },
        });
      }
      if (createdRecordIds.residentStays.length > 0) {
        await prisma.resident_stays.deleteMany({
          where: { id: { in: createdRecordIds.residentStays } },
        });
      }
      if (createdRecordIds.residents.length > 0) {
        await prisma.residents.deleteMany({
          where: { id: { in: createdRecordIds.residents } },
        });
      }
      if (createdRecordIds.members.length > 0) {
        await prisma.organization_members.deleteMany({
          where: { id: { in: createdRecordIds.members } },
        });
      }
      if (createdRecordIds.users.length > 0) {
        await prisma.users.deleteMany({
          where: { id: { in: createdRecordIds.users } },
        });
      }
    } catch (cleanErr) {
      console.warn('Cleanup notice:', cleanErr.message);
    }

    await prisma.$disconnect();
  }

  console.log('\n====================================================');
  console.log(`PHASE 18 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
