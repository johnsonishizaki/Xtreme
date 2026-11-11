import {
  DutyAssignment,
  Roster,
  HouseConfig,
  AcademicTerm,
  HouseDailyReport
} from '../types';

// ============================================
// 1. CONFIGURABLE 8 HOUSES (4 BOYS, 4 GIRLS)
// Strictly NO personal names anywhere in the project
// ============================================

export const DEFAULT_HOUSES: HouseConfig[] = [
  // 4 BOYS HOUSES
  {
    id: 'house-1',
    name: 'St. Paul Boys',
    category: 'Boys',
    assignedHouseparent: 'Houseparent St. Paul Boys',
    houseCode: 'SP-B',
    expectedStudentCount: 120,
    active: true,
    displayOrder: 1
  },
  {
    id: 'house-2',
    name: 'St. Joseph Boys',
    category: 'Boys',
    assignedHouseparent: 'Houseparent St. Joseph Boys',
    houseCode: 'SJ-B',
    expectedStudentCount: 115,
    active: true,
    displayOrder: 2
  },
  {
    id: 'house-3',
    name: 'St. Mary Boys',
    category: 'Boys',
    assignedHouseparent: 'Houseparent St. Mary Boys',
    houseCode: 'SM-B',
    expectedStudentCount: 121,
    active: true,
    displayOrder: 3
  },
  {
    id: 'house-4',
    name: 'St. Thomas Boys',
    category: 'Boys',
    assignedHouseparent: 'Houseparent St. Thomas Boys',
    houseCode: 'ST-B',
    expectedStudentCount: 110,
    active: true,
    displayOrder: 4
  },

  // 4 GIRLS HOUSES
  {
    id: 'house-5',
    name: 'St. Paul Girls',
    category: 'Girls',
    assignedHouseparent: 'Houseparent St. Paul Girls',
    houseCode: 'SP-G',
    expectedStudentCount: 122,
    active: true,
    displayOrder: 5
  },
  {
    id: 'house-6',
    name: 'St. Joseph Girls',
    category: 'Girls',
    assignedHouseparent: 'Houseparent St. Joseph Girls',
    houseCode: 'SJ-G',
    expectedStudentCount: 118,
    active: true,
    displayOrder: 6
  },
  {
    id: 'house-7',
    name: 'St. Mary Girls',
    category: 'Girls',
    assignedHouseparent: 'Houseparent St. Mary Girls',
    houseCode: 'SM-G',
    expectedStudentCount: 127,
    active: true,
    displayOrder: 7
  },
  {
    id: 'house-8',
    name: 'St. Thomas Girls',
    category: 'Girls',
    assignedHouseparent: 'Houseparent St. Thomas Girls',
    houseCode: 'ST-G',
    expectedStudentCount: 116,
    active: true,
    displayOrder: 8
  }
];

// ============================================
// 2. ACADEMIC TERMS
// ============================================

export const DEFAULT_TERM: AcademicTerm = {
  id: 'term-1-2026',
  academicYear: '2026/2027',
  termName: 'Term 1',
  openingDate: '2026-10-07',
  reportingStartDate: '2026-10-07',
  reportingEndDate: '2026-10-12',
  status: 'open',
  houseExpectedCounts: {
    'house-1': 120,
    'house-2': 115,
    'house-3': 121,
    'house-4': 110,
    'house-5': 122,
    'house-6': 118,
    'house-7': 127,
    'house-8': 116
  },
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-07T08:00:00.000Z'
};

// ============================================
// 3. SAMPLE HOUSE REPORTS (DEMO)
// 7 October 2026 (matches prompt example):
// Boys: 448/466, Girls: 471/483, Total: 919/949 (30 not reported)
// ============================================

export const SAMPLE_HOUSE_REPORTS: HouseDailyReport[] = [
  // 7 October 2026 - Opening Day (All 8 houses reported)
  {
    id: '2026-10-07_house-1',
    termId: 'term-1-2026',
    reportingDate: '2026-10-07',
    houseId: 'house-1',
    houseName: 'St. Paul Boys',
    houseCategory: 'Boys',
    expectedCount: 120,
    reportedCount: 116,
    notReportedCount: 4,
    notReportedDetails: '2 expected on bus tomorrow morning; 1 travel delay; 1 family bereavement.',
    notes: 'All prefects arrived early and assisted with dorm allocations.',
    houseparent: 'Houseparent St. Paul Boys',
    submittedAt: '2026-10-07T14:30:00.000Z',
    updatedAt: '2026-10-07T14:30:00.000Z',
    status: 'received',
    source: 'google_form'
  },
  {
    id: '2026-10-07_house-2',
    termId: 'term-1-2026',
    reportingDate: '2026-10-07',
    houseId: 'house-2',
    houseName: 'St. Joseph Boys',
    houseCategory: 'Boys',
    expectedCount: 115,
    reportedCount: 108,
    notReportedCount: 7,
    notReportedDetails: '3 expected tomorrow afternoon; 2 parents called regarding doctor visits; 2 unconfirmed.',
    notes: 'Requires follow-up by Senior Houseparent for the 2 unconfirmed cases.',
    houseparent: 'Houseparent St. Joseph Boys',
    submittedAt: '2026-10-07T15:10:00.000Z',
    updatedAt: '2026-10-07T15:10:00.000Z',
    status: 'received',
    source: 'google_form'
  },
  {
    id: '2026-10-07_house-3',
    termId: 'term-1-2026',
    reportingDate: '2026-10-07',
    houseId: 'house-3',
    houseName: 'St. Mary Boys',
    houseCategory: 'Boys',
    expectedCount: 121,
    reportedCount: 121,
    notReportedCount: 0,
    notReportedDetails: '',
    notes: 'Full house attendance achieved on opening day.',
    houseparent: 'Houseparent St. Mary Boys',
    submittedAt: '2026-10-07T16:00:00.000Z',
    updatedAt: '2026-10-07T16:00:00.000Z',
    status: 'received',
    source: 'google_form'
  },
  {
    id: '2026-10-07_house-4',
    termId: 'term-1-2026',
    reportingDate: '2026-10-07',
    houseId: 'house-4',
    houseName: 'St. Thomas Boys',
    houseCategory: 'Boys',
    expectedCount: 110,
    reportedCount: 103,
    notReportedCount: 7,
    notReportedDetails: '4 flight delays from overseas; 2 sports tournament returnees; 1 medical excuse.',
    notes: 'Overseas students confirmed landing late tonight.',
    houseparent: 'Houseparent St. Thomas Boys',
    submittedAt: '2026-10-07T16:15:00.000Z',
    updatedAt: '2026-10-07T16:15:00.000Z',
    status: 'received',
    source: 'google_form'
  },
  {
    id: '2026-10-07_house-5',
    termId: 'term-1-2026',
    reportingDate: '2026-10-07',
    houseId: 'house-5',
    houseName: 'St. Paul Girls',
    houseCategory: 'Girls',
    expectedCount: 122,
    reportedCount: 119,
    notReportedCount: 3,
    notReportedDetails: '2 arriving on evening train; 1 parent called with notice of minor fever.',
    notes: 'All key student luggage accounted for.',
    houseparent: 'Houseparent St. Paul Girls',
    submittedAt: '2026-10-07T15:45:00.000Z',
    updatedAt: '2026-10-07T15:45:00.000Z',
    status: 'received',
    source: 'google_form'
  },
  {
    id: '2026-10-07_house-6',
    termId: 'term-1-2026',
    reportingDate: '2026-10-07',
    houseId: 'house-6',
    houseName: 'St. Joseph Girls',
    houseCategory: 'Girls',
    expectedCount: 118,
    reportedCount: 114,
    notReportedCount: 4,
    notReportedDetails: '2 visa processing delays; 2 scheduled to report on Day 2.',
    notes: 'Guardian signed delayed arrival acknowledgement form.',
    houseparent: 'Houseparent St. Joseph Girls',
    submittedAt: '2026-10-07T16:05:00.000Z',
    updatedAt: '2026-10-07T16:05:00.000Z',
    status: 'received',
    source: 'google_form'
  },
  {
    id: '2026-10-07_house-7',
    termId: 'term-1-2026',
    reportingDate: '2026-10-07',
    houseId: 'house-7',
    houseName: 'St. Mary Girls',
    houseCategory: 'Girls',
    expectedCount: 127,
    reportedCount: 127,
    notReportedCount: 0,
    notReportedDetails: '',
    notes: '100% reporting rate completed before 4:00 PM.',
    houseparent: 'Houseparent St. Mary Girls',
    submittedAt: '2026-10-07T15:50:00.000Z',
    updatedAt: '2026-10-07T15:50:00.000Z',
    status: 'received',
    source: 'google_form'
  },
  {
    id: '2026-10-07_house-8',
    termId: 'term-1-2026',
    reportingDate: '2026-10-07',
    houseId: 'house-8',
    houseName: 'St. Thomas Girls',
    houseCategory: 'Girls',
    expectedCount: 116,
    reportedCount: 111,
    notReportedCount: 5,
    notReportedDetails: '3 pending fee clearance confirmation; 2 transport logistics from northern region.',
    notes: 'Accounts department informed.',
    houseparent: 'Houseparent St. Thomas Girls',
    submittedAt: '2026-10-07T16:20:00.000Z',
    updatedAt: '2026-10-07T16:20:00.000Z',
    status: 'received',
    source: 'google_form'
  },

  // 6 October 2026 - Pre-Opening Early Arrival Day
  {
    id: '2026-10-06_house-1',
    termId: 'term-1-2026',
    reportingDate: '2026-10-06',
    houseId: 'house-1',
    houseName: 'St. Paul Boys',
    houseCategory: 'Boys',
    expectedCount: 120,
    reportedCount: 45,
    notReportedCount: 75,
    notReportedDetails: 'Prefects and senior boarders only.',
    notes: 'Early arrivals settled.',
    houseparent: 'Houseparent St. Paul Boys',
    submittedAt: '2026-10-06T18:00:00.000Z',
    updatedAt: '2026-10-06T18:00:00.000Z',
    status: 'received',
    source: 'google_form'
  },
  {
    id: '2026-10-06_house-3',
    termId: 'term-1-2026',
    reportingDate: '2026-10-06',
    houseId: 'house-3',
    houseName: 'St. Mary Boys',
    houseCategory: 'Boys',
    expectedCount: 121,
    reportedCount: 48,
    notReportedCount: 73,
    notReportedDetails: 'Student leadership council arrivals.',
    notes: 'Dinner served normally.',
    houseparent: 'Houseparent St. Mary Boys',
    submittedAt: '2026-10-06T18:15:00.000Z',
    updatedAt: '2026-10-06T18:15:00.000Z',
    status: 'received',
    source: 'google_form'
  }
];

// ============================================
// 4. TEACHER DUTY SAMPLE DATA
// Strictly NO personal names - using generic roles
// ============================================

export const SAMPLE_ROSTER_ID = 'sample-roster-2026';

export const SAMPLE_ROSTER: Roster = {
  id: SAMPLE_ROSTER_ID,
  name: 'Sample Term 1 Duty Roster',
  sourceType: 'sample',
  totalWeeks: 5,
  uploadedAt: '2026-10-01T08:00:00.000Z',
  isActive: true,
  notes: 'Operational duty schedule with generic duty roles.'
};

export const SAMPLE_ASSIGNMENTS: DutyAssignment[] = [
  {
    id: 'sample-assign-1',
    rosterId: SAMPLE_ROSTER_ID,
    weekLabel: 'Week 1: 05 - 11 October 2026',
    startDate: '2026-10-05',
    endDate: '2026-10-11',
    teachers: [
      { id: 't-1', name: 'Teacher 1', role: 'Main Gate & Assembly' },
      { id: 't-2', name: 'Teacher 2', role: 'Main Gate & Assembly' }
    ],
    dutyTitle: 'Main Gate & Morning Assembly',
    status: 'confirmed',
    confidence: 'high',
    notes: 'Opening week duty team',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z'
  },
  {
    id: 'sample-assign-2',
    rosterId: SAMPLE_ROSTER_ID,
    weekLabel: 'Week 2: 12 - 18 October 2026',
    startDate: '2026-10-12',
    endDate: '2026-10-18',
    teachers: [
      { id: 't-3', name: 'Teacher 3', role: 'Cafeteria & Corridors' },
      { id: 't-4', name: 'Teacher 4', role: 'Sports Ground & Courtyard' }
    ],
    dutyTitle: 'Campus Supervision & Dining Hall',
    status: 'confirmed',
    confidence: 'high',
    notes: 'Upcoming week (Sunday reminder ready)',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z'
  },
  {
    id: 'sample-assign-3',
    rosterId: SAMPLE_ROSTER_ID,
    weekLabel: 'Week 3: 19 - 25 October 2026',
    startDate: '2026-10-19',
    endDate: '2026-10-25',
    teachers: [
      { id: 't-5', name: 'Teacher 5', role: 'Morning Assembly & Gate' },
      { id: 't-6', name: 'Teacher 6', role: 'Dismissal & Bus Bay' }
    ],
    dutyTitle: 'Entry & Departure Supervision',
    status: 'confirmed',
    confidence: 'high',
    notes: 'Future duty week',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z'
  },
  {
    id: 'sample-assign-4',
    rosterId: SAMPLE_ROSTER_ID,
    weekLabel: 'Week 4: 26 October - 01 November 2026',
    startDate: '2026-10-26',
    endDate: '2026-11-01',
    teachers: [
      { id: 't-7', name: 'Teacher 7', role: 'Weekly Duty Lead' }
    ],
    dutyTitle: 'Mid-Term Boarding Oversight',
    status: 'confirmed',
    confidence: 'high',
    notes: 'Future duty week',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z'
  },
  {
    id: 'sample-assign-5',
    rosterId: SAMPLE_ROSTER_ID,
    weekLabel: 'Week 5: 02 - 08 November 2026',
    startDate: '2026-11-02',
    endDate: '2026-11-08',
    teachers: [
      { id: 't-8', name: 'Teacher 8', role: 'Assembly & Grounds' },
      { id: 't-9', name: 'Teacher 9', role: 'Dining Hall' }
    ],
    dutyTitle: 'Weekly Campus Duty',
    status: 'confirmed',
    confidence: 'high',
    notes: 'Future duty week',
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z'
  }
];
