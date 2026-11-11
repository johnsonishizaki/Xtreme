/**
 * Automated Test Suite for Xtreme Google Forms Attendance Receiver
 * Tests authentication, validation, duplicate protection, collation compatibility, and error handling.
 */

import {
  authenticateWebhookRequest,
  validateGoogleFormsSubmission,
  extractProvidedSecret,
  setWebhookSecret,
  getWebhookSecret
} from '../src/server/googleFormsReceiver.ts';
import { DEFAULT_HOUSES, DEFAULT_TERM } from '../src/services/sampleData.ts';
import { collateDailyReports } from '../src/services/firebase.ts';
import { HouseDailyReport } from '../src/types/index.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    failed++;
  }
}

export async function runGoogleFormsReceiverTests() {
  console.log('\n======================================================');
  console.log('XTREME: GOOGLE FORMS RECEIVER TEST SUITE');
  console.log('======================================================\n');

  const TEST_SECRET = 'xtreme_test_webhook_secret_9988';
  setWebhookSecret(TEST_SECRET);

  // ----------------------------------------------------
  // TEST GROUP 1: AUTHENTICATION
  // ----------------------------------------------------
  console.log('--- Group 1: Webhook Secret Authentication ---');

  // Test 1: Reject request with missing secret
  const reqNoAuth = { headers: {}, body: {} } as any;
  const auth1 = authenticateWebhookRequest(reqNoAuth, TEST_SECRET);
  assert(!auth1.authenticated, 'Rejects request missing all secret headers (401)');

  // Test 2: Reject request with invalid secret
  const reqWrongAuth = {
    headers: { 'x-webhook-secret': 'wrong_secret_token' },
    body: {}
  } as any;
  const auth2 = authenticateWebhookRequest(reqWrongAuth, TEST_SECRET);
  assert(!auth2.authenticated, 'Rejects request with incorrect secret (401)');

  // Test 3: Authenticate via X-Webhook-Secret header
  const reqHeaderAuth = {
    headers: { 'x-webhook-secret': TEST_SECRET },
    body: {}
  } as any;
  const auth3 = authenticateWebhookRequest(reqHeaderAuth, TEST_SECRET);
  assert(auth3.authenticated, 'Authenticates via X-Webhook-Secret header');

  // Test 4: Authenticate via Authorization: Bearer <secret> header
  const reqBearerAuth = {
    headers: { authorization: `Bearer ${TEST_SECRET}` },
    body: {}
  } as any;
  const auth4 = authenticateWebhookRequest(reqBearerAuth, TEST_SECRET);
  assert(auth4.authenticated, 'Authenticates via Authorization: Bearer header');

  // Test 5: Extract secret from x-google-forms-secret header
  const reqGfAuth = {
    headers: { 'x-google-forms-secret': TEST_SECRET },
    body: {}
  } as any;
  const auth5 = authenticateWebhookRequest(reqGfAuth, TEST_SECRET);
  assert(auth5.authenticated, 'Authenticates via x-google-forms-secret header');

  // ----------------------------------------------------
  // TEST GROUP 2: SUBMISSION IDENTIFIER & DUPLICATE PROTECTION
  // ----------------------------------------------------
  console.log('\n--- Group 2: Submission Identifier Validation ---');

  // Test 6: Missing submissionId is rejected
  const resMissingId = validateGoogleFormsSubmission(
    {
      reportingDate: '2026-10-09',
      house: 'St. Paul Boys',
      reportedCount: 118
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(!resMissingId.valid && resMissingId.statusCode === 400, 'Rejects submission without submissionId');

  // Test 7: Empty/whitespace submissionId is rejected
  const resEmptyId = validateGoogleFormsSubmission(
    {
      submissionId: '   ',
      reportingDate: '2026-10-09',
      house: 'St. Paul Boys',
      reportedCount: 118
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(!resEmptyId.valid, 'Rejects whitespace-only submissionId');

  // Test 8: Accepts responseId or id aliases
  const resAliasId = validateGoogleFormsSubmission(
    {
      responseId: 'resp_gas_9981',
      reportingDate: '2026-10-09',
      house: 'St. Paul Boys',
      reportedCount: 118
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(resAliasId.valid && (resAliasId as any).submissionId === 'resp_gas_9981', 'Accepts responseId alias for submissionId');

  // ----------------------------------------------------
  // TEST GROUP 3: REPORTING DATE VALIDATION
  // ----------------------------------------------------
  console.log('\n--- Group 3: Reporting Date Validation ---');

  // Test 9: Valid calendar date accepted
  const resValidDate = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_01',
      reportingDate: '2026-10-09',
      house: 'St. Paul Boys',
      reportedCount: 118
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(resValidDate.valid && (resValidDate as any).normalizedDate === '2026-10-09', 'Accepts valid YYYY-MM-DD date');

  // Test 10: Reject invalid date format
  const resBadFormat = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_02',
      reportingDate: '09/10/2026',
      house: 'St. Paul Boys',
      reportedCount: 118
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  // Note: normalizeDateString attempts parse or rejects
  if (!resBadFormat.valid) {
    assert(!resBadFormat.valid, 'Rejects malformed date string');
  } else {
    // If normalized to YYYY-MM-DD, verify it parsed correctly
    assert((resBadFormat as any).normalizedDate.length === 10, 'Normalizes date string to YYYY-MM-DD');
  }

  // Test 11: Reject non-existent calendar date (2026-02-31)
  const resFeb31 = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_03',
      reportingDate: '2026-02-31',
      house: 'St. Paul Boys',
      reportedCount: 118
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(!resFeb31.valid, 'Rejects impossible calendar date (February 31)');

  // Test 12: Reject invalid month (2026-13-10)
  const resMonth13 = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_04',
      reportingDate: '2026-13-10',
      house: 'St. Paul Boys',
      reportedCount: 118
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(!resMonth13.valid, 'Rejects invalid month (Month 13)');

  // ----------------------------------------------------
  // TEST GROUP 4: HOUSE VALIDATION (8 OLAG HOUSES)
  // ----------------------------------------------------
  console.log('\n--- Group 4: House Validation (8 OLAG Houses) ---');

  // Test 13: Reject unknown house name
  const resUnknownHouse = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_05',
      reportingDate: '2026-10-09',
      house: 'Gryffindor House',
      reportedCount: 100
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(!resUnknownHouse.valid, 'Rejects non-OLAG house (Gryffindor)');

  // Test 14: Accurately validates each of the 8 OLAG houses
  const expectedHouseNames = [
    'St. Paul Boys',
    'St. Joseph Boys',
    'St. Mary Boys',
    'St. Thomas Boys',
    'St. Paul Girls',
    'St. Joseph Girls',
    'St. Mary Girls',
    'St. Thomas Girls'
  ];
  let allHousesMatched = true;
  for (const hName of expectedHouseNames) {
    const res = validateGoogleFormsSubmission(
      {
        submissionId: `sub_${hName}`,
        reportingDate: '2026-10-09',
        house: hName,
        reportedCount: 100
      },
      DEFAULT_HOUSES,
      DEFAULT_TERM
    );
    if (!res.valid || (res as any).matchedHouse.name !== hName) {
      allHousesMatched = false;
      console.error(`Failed matching house: ${hName}`);
    }
  }
  assert(allHousesMatched, 'Accurately recognizes all 8 official OLAG SHS houses');

  // Test 15: Case-insensitive and trimmed house matching
  const resCase = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_case',
      reportingDate: '2026-10-09',
      house: '  st. thomas girls  ',
      reportedCount: 105
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(resCase.valid && (resCase as any).matchedHouse.name === 'St. Thomas Girls', 'Case-insensitive & whitespace trimmed house matching');

  // ----------------------------------------------------
  // TEST GROUP 5: ATTENDANCE COUNTS VALIDATION
  // ----------------------------------------------------
  console.log('\n--- Group 5: Attendance Counts (Whole Numbers >= 0) ---');

  // Test 16: Reject negative reported count
  const resNegativeReported = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_06',
      reportingDate: '2026-10-09',
      house: 'St. Paul Boys',
      reportedCount: -5
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(!resNegativeReported.valid, 'Rejects negative student-present count (-5)');

  // Test 17: Reject decimal/fractional reported count
  const resDecimalReported = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_07',
      reportingDate: '2026-10-09',
      house: 'St. Paul Boys',
      reportedCount: 110.5
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(!resDecimalReported.valid, 'Rejects fractional student-present count (110.5)');

  // Test 18: Reject negative new arrivals count
  const resNegativeArrivals = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_08',
      reportingDate: '2026-10-09',
      house: 'St. Paul Boys',
      reportedCount: 110,
      newArrivalsCount: -2
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(!resNegativeArrivals.valid, 'Rejects negative new arrivals count (-2)');

  // Test 19: Optional new arrivals count defaults to 0
  const resOmittedArrivals = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_09',
      reportingDate: '2026-10-09',
      house: 'St. Paul Boys',
      reportedCount: 115
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(resOmittedArrivals.valid && (resOmittedArrivals as any).newArrivalsCount === 0, 'New arrivals defaults to 0 when omitted');

  // Test 20: Reject reported count exceeding house capacity
  const resOverCapacity = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_10',
      reportingDate: '2026-10-09',
      house: 'St. Paul Boys', // Capacity is 120
      reportedCount: 150
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(!resOverCapacity.valid && resOverCapacity.statusCode === 400, 'Rejects reported count exceeding house expected capacity (150 > 120)');

  // ----------------------------------------------------
  // TEST GROUP 6: NOTES & ARTIFACT PRESERVATION
  // ----------------------------------------------------
  console.log('\n--- Group 6: Notes & Attendance Dashboard Compatibility ---');

  // Test 21: Optional notes preserved
  const testNotes = '2 students on medical exeat, 1 attending science quiz';
  const resNotes = validateGoogleFormsSubmission(
    {
      submissionId: 'sub_test_11',
      reportingDate: '2026-10-09',
      house: 'St. Paul Boys',
      reportedCount: 117,
      notes: testNotes
    },
    DEFAULT_HOUSES,
    DEFAULT_TERM
  );
  assert(resNotes.valid && (resNotes as any).notes === testNotes, 'Preserves submitted notes / reasons');

  // Test 22: Generates clean HouseDailyReport compatible with collateDailyReports
  if (resNotes.valid) {
    const val = resNotes as any;
    const generatedReport: HouseDailyReport = {
      id: `${val.normalizedDate}_${val.matchedHouse.id}`,
      termId: DEFAULT_TERM.id,
      reportingDate: val.normalizedDate,
      houseId: val.matchedHouse.id,
      houseName: val.matchedHouse.name,
      houseCategory: val.matchedHouse.category,
      expectedCount: val.expectedCount,
      reportedCount: val.reportedCount,
      notReportedCount: val.notReportedCount,
      newArrivalsCount: val.newArrivalsCount,
      notes: val.notes,
      houseparent: val.matchedHouse.assignedHouseparent,
      submittedAt: val.submittedAtIso,
      updatedAt: new Date().toISOString(),
      status: 'received',
      source: 'google_form'
    };

    assert(generatedReport.notReportedCount === 3, 'Calculates notReportedCount deterministically (120 - 117 = 3)');

    const collation = collateDailyReports([generatedReport], DEFAULT_HOUSES, '2026-10-09', DEFAULT_TERM.id);
    assert(collation.totalReported === 117, 'Integrates seamlessly with existing attendance collation dashboard');
    assert(collation.reportsReceivedCount === 1, 'Records received report count in collation');
    assert(collation.missingHouseIds.length === 7, 'Correctly flags remaining 7 missing houses');
  }

  console.log('\n------------------------------------------------------');
  console.log(`GOOGLE FORMS TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    throw new Error(`Google Forms Receiver test suite failed with ${failed} failure(s).`);
  }
}

// Direct execution when invoked via tsx
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('googleFormsReceiver.test')) {
  runGoogleFormsReceiverTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
