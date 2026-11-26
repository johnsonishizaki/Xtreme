import assert from 'assert';
import { DEFAULT_TEMPLATE } from '../src/constants/template.ts';
import {
  generateAnnouncementMessage,
  generateFullCollationWhatsAppMessage
} from '../src/services/messageGenerator.ts';
import {
  aggregateOperationalSnapshot,
  convertAggregatedSnapshotToCsv,
  convertAggregatedSnapshotToWorkbook
} from '../src/services/exportService.ts';
import { AcademicTerm, DutyAssignment, HouseConfig, HouseDailyReport, Roster, SendHistory } from '../src/types/index.ts';
import {
  buildDutyCalendarIcs,
  getNextReminderDate,
  formatCountdownToReminder,
  isDutyReminderOverdue
} from '../src/services/notificationService.ts';
import { getLocalTodayIso } from '../src/services/messageGenerator.ts';
import { DEFAULT_SETTINGS } from '../src/services/firebase.ts';
import { CHEAPEST_GEMINI_MODELS } from '../src/server/aiController.ts';

export async function runAnnouncementAndMidtermTests() {
  console.log('Running Announcement Format & Mid-Term tests...');

  const sampleWeek10: DutyAssignment = {
    id: 'week-10-test',
    rosterId: 'roster-test',
    weekLabel: 'Week 10',
    startDate: '2026-11-16',
    endDate: '2026-11-22',
    dutyTitle: 'Weekly Duty',
    status: 'confirmed',
    confidence: 'high',
    createdAt: '2026-11-15T08:00:00.000Z',
    updatedAt: '2026-11-15T08:00:00.000Z',
    teachers: [
      { id: 't1', name: 'Frimpong Emmanuel', role: 'Leader' },
      { id: 't2', name: 'Adu Gyamfi Callistus' },
      { id: 't3', name: 'Bashiru Idrisu' },
      { id: 't4', name: 'Blessing Hodeme' }
    ]
  };

  const expectedMessage = `ATTENTION! ATTENTION! ATTENTION!
Masters/Mistresses On Duty For Week 10

(From 16/11/2026 To 22/11/2026)

1. FRIMPONG EMMANUEL *(LEADER)*
2. ADU GYAMFI CALLISTUS
3. BASHIRU IDRISU
4. BLESSING HODEME

Kindly take note: *Tuesday is GENERAL CLEANING.* FORM MASTERS, MASTERS & MISTRESSES ON DUTY SHOULD KINDLY TAKE NOTE.

🙏🏾Thank you



DUTIES/RESPONSIBILITIES:
- *Supervision of work on the compound*
- *Ensuring students discipline*
- *Supervision of dining Session*
- *Identifying and punishing latecomers*
- *Making sure students are in their classroom during classes time*
- *making sure students (patients) take their drugs from the sick bay*
•*Writing names of offenders in the punishment book for punishment on Tuesday*
- *Writing Names of students who refuse to eat and those who don’t use the appropriate set of cutlery for punishment*
- *Writing reports on activities during period of duty.*



N/B
- Team Leader is to contact Senior/assistant senior house tutor for report form.
- Team Leader is to ensure that names of teachers who perform the duty are written on the report form.
- Your commitment and cooperation will be highly anticipated.
•Failure to attend to your duties requires sanction from management.`;

  const actualMessage = generateAnnouncementMessage(DEFAULT_TEMPLATE, sampleWeek10);
  assert.strictEqual(actualMessage, expectedMessage, 'Generated announcement should match OLAG SHS format exactly');

  // Verify implicit first teacher leader fallback when role is omitted
  const implicitLeaderAssignment: DutyAssignment = {
    ...sampleWeek10,
    teachers: [
      { id: 't1', name: 'Frimpong Emmanuel' },
      { id: 't2', name: 'Adu Gyamfi Callistus' }
    ]
  };
  const implicitActual = generateAnnouncementMessage(DEFAULT_TEMPLATE, implicitLeaderAssignment);
  assert.ok(
    implicitActual.includes('1. FRIMPONG EMMANUEL *(LEADER)*'),
    'First teacher should automatically receive *(LEADER)* when no explicit leader role is provided'
  );

  // Verify Mid-Term collation summary header
  const midTerm: AcademicTerm = {
    id: 'midterm-1-2026',
    academicYear: '2026/2027',
    termName: 'Mid-Term 1',
    termType: 'midterm',
    openingDate: '2026-11-16',
    reportingStartDate: '2026-11-16',
    reportingEndDate: '2026-11-18',
    status: 'open',
    createdAt: '2026-11-15T08:00:00.000Z',
    updatedAt: '2026-11-15T08:00:00.000Z'
  };

  const midTermSummary = generateFullCollationWhatsAppMessage(
    {
      totalExpected: 949,
      totalReported: 850,
      totalNotReported: 99,
      reportingPercentage: 89.6,
      reportsReceivedCount: 8,
      totalHousesCount: 8,
      boysExpected: 466,
      boysReported: 420,
      boysNotReported: 46,
      boysPercentage: 90.1,
      girlsExpected: 483,
      girlsReported: 430,
      girlsNotReported: 53,
      girlsPercentage: 89,
      missingHouseIds: []
    },
    [{ id: 'house-1', name: 'St. Paul Boys', category: 'Boys' }],
    new Map(),
    '2026-11-16',
    midTerm
  );

  assert.ok(
    midTermSummary.includes('📢 MID-TERM RETURN SCHOOL REPORT'),
    'Mid-term collation summary should use MID-TERM RETURN header'
  );
  assert.ok(
    midTermSummary.includes('Mid-Term 1 (2026/2027)'),
    'Mid-term collation summary should include the mid-term period label'
  );

  // Verify structured operational JSON aggregation + SheetJS workbook & CSV conversion
  const sampleHouses: HouseConfig[] = [
    {
      id: 'house-1',
      name: 'St. Paul Boys',
      category: 'Boys',
      assignedHouseparent: 'Mr. Addai',
      expectedStudentCount: 120,
      active: true,
      displayOrder: 1
    },
    {
      id: 'house-5',
      name: 'St. Paul Girls',
      category: 'Girls',
      assignedHouseparent: 'Miss Theo',
      expectedStudentCount: 122,
      active: true,
      displayOrder: 5
    }
  ];
  const sampleReports: HouseDailyReport[] = [
    {
      id: '2026-11-16_house-1',
      termId: midTerm.id,
      reportingDate: '2026-11-16',
      houseId: 'house-1',
      houseName: 'St. Paul Boys',
      houseCategory: 'Boys',
      expectedCount: 120,
      reportedCount: 100,
      notReportedCount: 20,
      submittedAt: '2026-11-16T08:00:00.000Z',
      updatedAt: '2026-11-16T08:00:00.000Z',
      status: 'received'
    }
  ];
  const sampleRosters: Roster[] = [
    {
      id: 'roster-test',
      name: 'Term 1 Duty Roster',
      sourceType: 'csv',
      totalWeeks: 1,
      uploadedAt: '2026-11-01T08:00:00.000Z',
      isActive: true
    }
  ];
  const sampleHistory: SendHistory[] = [
    {
      id: 'sent-1',
      assignmentId: sampleWeek10.id,
      weekLabel: sampleWeek10.weekLabel,
      dutyPeriod: '16/11/2026 - 22/11/2026',
      message: actualMessage,
      timestamp: '2026-11-16T08:00:00.000Z',
      status: 'sent_confirmed'
    }
  ];

  const snapshot = aggregateOperationalSnapshot({
    houses: sampleHouses,
    reports: sampleReports,
    activeTerm: midTerm,
    selectedDate: '2026-11-16',
    rosters: sampleRosters,
    assignments: [sampleWeek10],
    sendHistory: sampleHistory
  });

  assert.strictEqual(snapshot.dutyRosterStats.totalWeeks, 1);
  assert.strictEqual(snapshot.dutyRosterStats.sentWeeksCount, 1);
  assert.strictEqual(snapshot.dutyRosterStats.completionPercentage, 100);
  assert.strictEqual(snapshot.dutyRosterStats.uniqueTeachersCount, 4);
  assert.strictEqual(snapshot.attendanceSummary.totalExpected, 242);
  assert.strictEqual(snapshot.attendanceSummary.totalReported, 100);
  assert.strictEqual(snapshot.attendanceSummary.termType, 'midterm');

  const wb = convertAggregatedSnapshotToWorkbook(snapshot);
  assert.ok(wb.SheetNames.includes('Attendance Summary'));
  assert.ok(wb.SheetNames.includes('Duty Roster Stats'));
  assert.ok(wb.SheetNames.includes('Houses Breakdown'));
  assert.ok(wb.SheetNames.includes('Duty Weeks'));

  const csvOut = convertAggregatedSnapshotToCsv(snapshot);
  assert.ok(csvOut.includes('St. Paul Boys'), 'CSV output should include house rows');
  assert.ok(csvOut.includes('Week 10'), 'CSV output should include duty roster rows');

  // Verify local ISO date formatting preserves local calendar date without UTC shift
  const localLateNight = new Date(2026, 10, 16, 23, 55, 0);
  assert.strictEqual(getLocalTodayIso(localLateNight), '2026-11-16');

  // Verify no-automation defaults
  assert.strictEqual(DEFAULT_SETTINGS.autoAnnounceEnabled, false);
  assert.strictEqual(DEFAULT_SETTINGS.autoCopyOnSchedule, false);
  assert.strictEqual(DEFAULT_SETTINGS.soundAlertEnabled, true);
  assert.strictEqual(DEFAULT_SETTINGS.voiceAlertEnabled, true);

  // Verify RFC-5545 multi-week ICS generation & valid VALARM triggers
  const icsMultiWeek = buildDutyCalendarIcs({
    reminderDay: 0,
    reminderTime: '08:00',
    events: [
      {
        id: 'w10',
        weekLabel: 'Week 10',
        startDate: '2026-11-16',
        endDate: '2026-11-22',
        teachersText: 'Frimpong Emmanuel, Adu Gyamfi Callistus'
      },
      {
        id: 'w11',
        weekLabel: 'Week 11',
        startDate: '2026-11-23',
        endDate: '2026-11-29',
        teachersText: 'Bashiru Idrisu, Blessing Hodeme'
      }
    ]
  });
  assert.ok(icsMultiWeek.includes('BEGIN:VCALENDAR'));
  assert.strictEqual((icsMultiWeek.match(/BEGIN:VEVENT/g) || []).length, 2, 'Should emit one VEVENT per week');
  assert.ok(icsMultiWeek.includes('TRIGGER:-PT0M'), 'Should use valid RFC-5545 TRIGGER:-PT0M');
  assert.ok(!icsMultiWeek.includes('TRIGGER:PT0S'), 'Must not contain invalid TRIGGER:PT0S');
  assert.ok(icsMultiWeek.includes('DTSTART:20261115T080000'), 'Week 10 Mon start should alert Sunday 08:00');
  assert.ok(icsMultiWeek.includes('DTSTART:20261122T080000'), 'Week 11 Mon start should alert Sunday 08:00');

  const icsFallbackWeekly = buildDutyCalendarIcs({
    reminderDay: 0,
    reminderTime: '08:00',
    weekLabel: 'Week 10',
    teachersText: 'Frimpong Emmanuel'
  });
  assert.ok(icsFallbackWeekly.includes('RRULE:FREQ=WEEKLY;BYDAY=SU'));

  // Verify reminder schedule countdown & overdue detection
  const sundayBeforeReminder = new Date(2026, 10, 15, 7, 30, 0);
  const nextRem = getNextReminderDate(0, '08:00', sundayBeforeReminder);
  assert.strictEqual(nextRem.getHours(), 8);
  assert.strictEqual(nextRem.getDate(), 15);
  assert.strictEqual(formatCountdownToReminder(nextRem, sundayBeforeReminder), '30m');

  const mondayAfterStart = new Date(2026, 10, 16, 10, 0, 0);
  assert.strictEqual(isDutyReminderOverdue('2026-11-16', 0, '08:00', false, mondayAfterStart), true);
  assert.strictEqual(isDutyReminderOverdue('2026-11-16', 0, '08:00', true, mondayAfterStart), false);

  // Verify lean cheapest Gemini model chain (lowest model first, single cheapest fallback)
  assert.strictEqual(CHEAPEST_GEMINI_MODELS.length, 2);
  assert.strictEqual(CHEAPEST_GEMINI_MODELS[0].model, 'gemini-3.1-flash-lite');
  assert.strictEqual(CHEAPEST_GEMINI_MODELS[1].model, 'gemini-4-hydrogen');

  console.log('Announcement Format & Mid-Term tests passed!');
}


