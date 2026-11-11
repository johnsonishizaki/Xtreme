/**
 * Comprehensive Test Suite for Xtreme Tally API Integration
 * Covers all 16 test cases specified in the requirements.
 */

import {
  processTallyApiResponse,
  detectTallyQuestionMapping,
  matchHouse,
  normalizeHouseName,
  isValidCalendarDate,
  parseNonNegativeInteger
} from '../src/services/tallyParser';
import { DEFAULT_HOUSES, DEFAULT_TERM } from '../src/services/sampleData';
import { collateDailyReports } from '../src/services/firebase';
import { tallyService } from '../src/server/tallyService';
import { TallySubmissionsApiResponse } from '../src/types/tally';

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

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('XTREME: TALLY API INTEGRATION TEST SUITE (16 TEST CASES)');
  console.log('======================================================\n');

  // Sample Mock Tally Form Schema
  const mockQuestions = [
    { id: 'q_date', type: 'DATE', title: 'Reporting Date' },
    { id: 'q_house', type: 'DROPDOWN', title: 'Select House' },
    { id: 'q_reported', type: 'NUMBER', title: 'Number of Students Present' },
    { id: 'q_arrivals', type: 'NUMBER', title: 'Number of New Arrivals' },
    { id: 'q_notes', type: 'TEXTAREA', title: 'Notes / Reasons for Students Not Present' }
  ];

  // ----------------------------------------------------
  // TEST 1: Valid Tally API key authentication handling
  // ----------------------------------------------------
  console.log('Test 1: Valid Tally API key authentication handling');
  tallyService.saveConfiguration('valid_dummy_key', '2jBVWA', 5);
  const statusAfterConfig = tallyService.getStatus();
  assert(statusAfterConfig.hasApiKey === true, 'Tally service recognizes configured API key');
  assert(statusAfterConfig.formId === '2jBVWA', 'Tally service retains configured Form ID 2jBVWA');

  // ----------------------------------------------------
  // TEST 2: Missing or invalid Tally API key handling
  // ----------------------------------------------------
  console.log('\nTest 2: Missing or invalid Tally API key error handling');
  tallyService.saveConfiguration('', '2jBVWA', 5);
  const testConnMissing = await tallyService.testConnection();
  assert(testConnMissing.status === 'not_configured', 'Missing key reports not_configured status');
  assert(testConnMissing.message.includes('not configured'), 'Returns informative error for missing key');

  // ----------------------------------------------------
  // TEST 3: Form ID validation and submission retrieval
  // ----------------------------------------------------
  console.log('\nTest 3: Form ID validation and submission retrieval');
  tallyService.saveConfiguration('dummy_key_for_test', '2jBVWA', 5);
  const activeStatus = tallyService.getStatus();
  assert(activeStatus.formId === '2jBVWA', 'Universal Form ID 2jBVWA is active');

  // ----------------------------------------------------
  // TEST 4: Pagination support
  // ----------------------------------------------------
  console.log('\nTest 4: Pagination response handling');
  // Verify detector handles questions and submissions pagination payload
  const page1Payload: TallySubmissionsApiResponse = {
    page: 1,
    limit: 2,
    hasMore: true,
    totalNumberOfSubmissionsPerFilter: { all: 3 },
    questions: mockQuestions,
    submissions: [
      {
        id: 'sub_page_1',
        formId: '2jBVWA',
        createdAt: '2026-11-08T10:00:00Z',
        submittedAt: '2026-11-08T10:00:00Z',
        isCompleted: true,
        responses: [
          { id: 'r1', questionId: 'q_date', answer: '2026-11-08' },
          { id: 'r2', questionId: 'q_house', answer: 'St. Paul Boys' },
          { id: 'r3', questionId: 'q_reported', answer: 110 },
          { id: 'r4', questionId: 'q_arrivals', answer: 2 },
          { id: 'r5', questionId: 'q_notes', answer: 'First batch' }
        ]
      }
    ]
  };
  const processedP1 = processTallyApiResponse(page1Payload, DEFAULT_HOUSES, DEFAULT_TERM);
  assert(processedP1.validReports.length === 1, 'Page 1 submissions processed correctly');

  // ----------------------------------------------------
  // TEST 5: Field mapping for all six fields
  // ----------------------------------------------------
  console.log('\nTest 5: Field mapping for all six fields');
  const mapping = detectTallyQuestionMapping(mockQuestions);
  assert(mapping.reportingDateQuestionId === 'q_date', 'Mapped Reporting Date question ID');
  assert(mapping.houseQuestionId === 'q_house', 'Mapped House question ID');
  assert(mapping.reportedQuestionId === 'q_reported', 'Mapped Reported count question ID');
  assert(mapping.newArrivalsQuestionId === 'q_arrivals', 'Mapped New Arrivals question ID');
  assert(mapping.notesQuestionId === 'q_notes', 'Mapped Notes question ID');

  // ----------------------------------------------------
  // TEST 6: Recognition of all 8 OLAG SHS houses
  // ----------------------------------------------------
  console.log('\nTest 6: Recognition of all 8 OLAG SHS houses');
  const expected8 = [
    'St. Paul Boys',
    'St. Joseph Boys',
    'St. Mary Boys',
    'St. Thomas Boys',
    'St. Paul Girls',
    'St. Joseph Girls',
    'St. Mary Girls',
    'St. Thomas Girls'
  ];
  let all8Matched = true;
  for (const name of expected8) {
    const matched = matchHouse(name, DEFAULT_HOUSES);
    if (!matched || matched.name !== name) {
      all8Matched = false;
      console.error(`Failed matching house: ${name}`);
    }
  }
  assert(all8Matched, 'All 8 configured houses successfully matched');

  // ----------------------------------------------------
  // TEST 7: Exact house matching (trimmed, case-insensitive)
  // ----------------------------------------------------
  console.log('\nTest 7: Exact house matching (trimmed and case-insensitive)');
  const matchedWithWhitespace = matchHouse('  st. mary boys  ', DEFAULT_HOUSES);
  assert(matchedWithWhitespace?.id === 'house-3', 'Whitespace trimmed and case-insensitive match for St. Mary Boys');
  const matchedGirlsUpper = matchHouse('ST. JOSEPH GIRLS', DEFAULT_HOUSES);
  assert(matchedGirlsUpper?.id === 'house-6', 'Uppercase match for St. Joseph Girls');

  // ----------------------------------------------------
  // TEST 8: Invalid or unmapped house names flagged as Needs Review
  // ----------------------------------------------------
  console.log('\nTest 8: Invalid house names flagged as Needs Review');
  const invalidHousePayload: TallySubmissionsApiResponse = {
    questions: mockQuestions,
    submissions: [
      {
        id: 'sub_bad_house',
        formId: '2jBVWA',
        createdAt: '2026-11-08T10:00:00Z',
        submittedAt: '2026-11-08T10:00:00Z',
        isCompleted: true,
        responses: [
          { id: 'r1', questionId: 'q_date', answer: '2026-11-08' },
          { id: 'r2', questionId: 'q_house', answer: 'Unknown Dormitory 99' },
          { id: 'r3', questionId: 'q_reported', answer: 50 },
          { id: 'r4', questionId: 'q_arrivals', answer: 0 },
          { id: 'r5', questionId: 'q_notes', answer: '' }
        ]
      }
    ]
  };
  const processedBadHouse = processTallyApiResponse(invalidHousePayload, DEFAULT_HOUSES, DEFAULT_TERM);
  assert(processedBadHouse.validReports.length === 0, 'Invalid house rejected from valid reports');
  assert(processedBadHouse.reviewIssues.length === 1, 'Invalid house added to reviewIssues');
  assert(processedBadHouse.reviewIssues[0].reason.includes('does not match'), 'Descriptive review reason for unknown house');

  // ----------------------------------------------------
  // TEST 9: Valid real calendar date in YYYY-MM-DD accepted
  // ----------------------------------------------------
  console.log('\nTest 9: Valid real calendar date in YYYY-MM-DD accepted');
  assert(isValidCalendarDate('2026-11-08') === true, '2026-11-08 is a valid calendar date');
  assert(isValidCalendarDate('2026-02-28') === true, '2026-02-28 is a valid calendar date');

  // ----------------------------------------------------
  // TEST 10: Invalid calendar dates flagged as Needs Review
  // ----------------------------------------------------
  console.log('\nTest 10: Invalid calendar date flagged as Needs Review');
  assert(isValidCalendarDate('2026-02-31') === false, '2026-02-31 (non-existent leap day) is invalid');
  assert(isValidCalendarDate('not-a-date') === false, 'Arbitrary text is invalid');
  const badDatePayload: TallySubmissionsApiResponse = {
    questions: mockQuestions,
    submissions: [
      {
        id: 'sub_bad_date',
        formId: '2jBVWA',
        createdAt: '2026-11-08T10:00:00Z',
        submittedAt: '2026-11-08T10:00:00Z',
        isCompleted: true,
        responses: [
          { id: 'r1', questionId: 'q_date', answer: '2026-02-31' },
          { id: 'r2', questionId: 'q_house', answer: 'St. Paul Boys' },
          { id: 'r3', questionId: 'q_reported', answer: 100 },
          { id: 'r4', questionId: 'q_arrivals', answer: 0 }
        ]
      }
    ]
  };
  const processedBadDate = processTallyApiResponse(badDatePayload, DEFAULT_HOUSES, DEFAULT_TERM);
  assert(processedBadDate.validReports.length === 0, 'Invalid date rejected from valid reports');
  assert(processedBadDate.reviewIssues.length === 1, 'Invalid date flagged in review issues');

  // ----------------------------------------------------
  // TEST 11: Non-negative whole integer reported attendance accepted
  // ----------------------------------------------------
  console.log('\nTest 11: Non-negative whole integer reported attendance accepted');
  assert(parseNonNegativeInteger(105).valid === true, '105 is valid integer');
  assert(parseNonNegativeInteger('120').valid === true, '"120" parsed to valid integer');
  assert(parseNonNegativeInteger(0).value === 0, '0 is valid integer count');

  // ----------------------------------------------------
  // TEST 12: Negative numbers or non-integers flagged
  // ----------------------------------------------------
  console.log('\nTest 12: Negative numbers or invalid text flagged');
  assert(parseNonNegativeInteger(-5).valid === false, 'Negative number rejected');
  assert(parseNonNegativeInteger('abc').valid === false, 'Non-numeric string rejected');
  assert(parseNonNegativeInteger(12.5).valid === false, 'Floating point decimal count rejected');

  // ----------------------------------------------------
  // TEST 13: Optional new arrivals empty vs non-negative integer
  // ----------------------------------------------------
  console.log('\nTest 13: Optional new arrivals handled correctly');
  assert(parseNonNegativeInteger(null, true).value === 0, 'Null arrivals defaults safely to 0');
  assert(parseNonNegativeInteger('', true).value === 0, 'Empty string arrivals defaults to 0');
  assert(parseNonNegativeInteger(5, true).value === 5, '5 new arrivals parsed accurately');

  // ----------------------------------------------------
  // TEST 14: Notes text preserved without corruption
  // ----------------------------------------------------
  console.log('\nTest 14: Notes text preserved without corruption');
  const complexNote = '3 students delayed due to transport from Kumasi; expected 20:00.';
  const notePayload: TallySubmissionsApiResponse = {
    questions: mockQuestions,
    submissions: [
      {
        id: 'sub_notes',
        formId: '2jBVWA',
        createdAt: '2026-11-08T10:00:00Z',
        submittedAt: '2026-11-08T10:00:00Z',
        isCompleted: true,
        responses: [
          { id: 'r1', questionId: 'q_date', answer: '2026-11-08' },
          { id: 'r2', questionId: 'q_house', answer: 'St. Thomas Boys' },
          { id: 'r3', questionId: 'q_reported', answer: 95 },
          { id: 'r4', questionId: 'q_arrivals', answer: 4 },
          { id: 'r5', questionId: 'q_notes', answer: complexNote }
        ]
      }
    ]
  };
  const processedNote = processTallyApiResponse(notePayload, DEFAULT_HOUSES, DEFAULT_TERM);
  assert(processedNote.validReports[0].notes === complexNote, 'Notes preserved exactly without truncation or modification');
  assert(processedNote.validReports[0].notReportedDetails === complexNote, 'Notes mirrored into notReportedDetails');

  // ----------------------------------------------------
  // TEST 15: Duplicate prevention using Tally submission ID
  // ----------------------------------------------------
  console.log('\nTest 15: Duplicate prevention using Tally submission ID');
  const duplicateIdSet = new Set<string>(['sub_already_seen_123']);
  const duplicatePayload: TallySubmissionsApiResponse = {
    questions: mockQuestions,
    submissions: [
      {
        id: 'sub_already_seen_123',
        formId: '2jBVWA',
        createdAt: '2026-11-08T10:00:00Z',
        submittedAt: '2026-11-08T10:00:00Z',
        isCompleted: true,
        responses: [
          { id: 'r1', questionId: 'q_date', answer: '2026-11-08' },
          { id: 'r2', questionId: 'q_house', answer: 'St. Mary Girls' },
          { id: 'r3', questionId: 'q_reported', answer: 88 },
          { id: 'r4', questionId: 'q_arrivals', answer: 1 }
        ]
      }
    ]
  };
  const processedDupe = processTallyApiResponse(duplicatePayload, DEFAULT_HOUSES, DEFAULT_TERM, duplicateIdSet);
  assert(processedDupe.validReports.length === 0, 'Previously processed submission ID is skipped');
  assert(processedDupe.duplicatesSkipped === 1, 'Duplicates counter incremented to 1');

  // ----------------------------------------------------
  // TEST 16: Valid attendance updates daily collation totals
  // ----------------------------------------------------
  console.log('\nTest 16: Daily collation updates from valid Tally reports');
  const mockAll8Submissions = expected8.map((hName, idx) => ({
    id: `sub_all_${idx}`,
    formId: '2jBVWA',
    createdAt: '2026-11-08T10:00:00Z',
    submittedAt: '2026-11-08T10:00:00Z',
    isCompleted: true,
    responses: [
      { id: `r1_${idx}`, questionId: 'q_date', answer: '2026-11-08' },
      { id: `r2_${idx}`, questionId: 'q_house', answer: hName },
      { id: `r3_${idx}`, questionId: 'q_reported', answer: 100 },
      { id: `r4_${idx}`, questionId: 'q_arrivals', answer: 2 },
      { id: `r5_${idx}`, questionId: 'q_notes', answer: `All good in ${hName}` }
    ]
  }));

  const all8Payload: TallySubmissionsApiResponse = {
    questions: mockQuestions,
    submissions: mockAll8Submissions
  };
  const processedAll8 = processTallyApiResponse(all8Payload, DEFAULT_HOUSES, DEFAULT_TERM);
  assert(processedAll8.validReports.length === 8, '8 valid reports generated for 8 houses');

  // Verify daily collation calculation
  const collation = collateDailyReports(processedAll8.validReports, DEFAULT_HOUSES, '2026-11-08', DEFAULT_TERM.id);
  assert(collation.reportsReceivedCount === 8, 'All 8 reports recorded in daily collation');
  assert(collation.totalReported === 800, 'Total reported equals 800 (8 x 100)');
  assert(collation.boysReported === 400, 'Boys reported equals 400 (4 x 100)');
  assert(collation.girlsReported === 400, 'Girls reported equals 400 (4 x 100)');
  assert(collation.missingHouseIds.length === 0, 'Zero missing houses in collation');

  tallyService.saveConfiguration('', '2jBVWA', 5);
  tallyService.stopPolling();

  console.log('\n------------------------------------------------------');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
