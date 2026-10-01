import { DutyAssignment, Roster } from '../types';

export const SAMPLE_ROSTER_ID = 'sample-roster-2026';

export const SAMPLE_ROSTER: Roster = {
  id: SAMPLE_ROSTER_ID,
  name: 'Sample Term 3 Duty Roster (Demo)',
  sourceType: 'sample',
  totalWeeks: 5,
  uploadedAt: '2026-09-20T08:00:00.000Z',
  isActive: true,
  notes: 'Demonstration duty schedule with generic duty assignments.'
};

export const SAMPLE_ASSIGNMENTS: DutyAssignment[] = [
  {
    id: 'sample-assign-1',
    rosterId: SAMPLE_ROSTER_ID,
    weekLabel: 'Week 1: 14 - 20 September 2026',
    startDate: '2026-09-14',
    endDate: '2026-09-20',
    teachers: [
      { id: 't-1', name: 'Teacher 1', role: 'Main Gate & Assembly' },
      { id: 't-2', name: 'Teacher 2', role: 'Main Gate & Assembly' }
    ],
    dutyTitle: 'Main Gate & Morning Assembly',
    status: 'confirmed',
    confidence: 'high',
    notes: 'Past week completed',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z'
  },
  {
    id: 'sample-assign-2',
    rosterId: SAMPLE_ROSTER_ID,
    weekLabel: 'Week 2: 21 - 27 September 2026',
    startDate: '2026-09-21',
    endDate: '2026-09-27',
    teachers: [
      { id: 't-3', name: 'Teacher 3', role: 'Cafeteria & Corridors' },
      { id: 't-4', name: 'Teacher 4', role: 'Sports Ground & Courtyard' }
    ],
    dutyTitle: 'Weekly Duty: Campus Supervision',
    status: 'confirmed',
    confidence: 'high',
    notes: 'Current active duty week',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z'
  },
  {
    id: 'sample-assign-3',
    rosterId: SAMPLE_ROSTER_ID,
    weekLabel: 'Week 3: 28 September - 04 October 2026',
    startDate: '2026-09-28',
    endDate: '2026-10-04',
    teachers: [
      { id: 't-5', name: 'Teacher 5', role: 'Morning Assembly & Gate' },
      { id: 't-6', name: 'Teacher 6', role: 'Dismissal & Bus Bay' }
    ],
    dutyTitle: 'Weekly Duty: Entry & Departure',
    status: 'confirmed',
    confidence: 'high',
    notes: 'Coming week (Next Sunday announcement)',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z'
  },
  {
    id: 'sample-assign-4',
    rosterId: SAMPLE_ROSTER_ID,
    weekLabel: 'Week 4: 05 - 11 October 2026',
    startDate: '2026-10-05',
    endDate: '2026-10-11',
    teachers: [
      { id: 't-7', name: 'Teacher 7', role: 'Weekly Duty Lead' }
    ],
    dutyTitle: 'General Campus Supervision',
    status: 'confirmed',
    confidence: 'high',
    notes: 'Future duty week',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z'
  },
  {
    id: 'sample-assign-5',
    rosterId: SAMPLE_ROSTER_ID,
    weekLabel: 'Week 5: 12 - 18 October 2026',
    startDate: '2026-10-12',
    endDate: '2026-10-18',
    teachers: [
      { id: 't-8', name: 'Teacher 8', role: 'Assembly & Grounds' },
      { id: 't-9', name: 'Teacher 9', role: 'Cafeteria & Corridors' }
    ],
    dutyTitle: 'Weekly Campus Duty',
    status: 'confirmed',
    confidence: 'high',
    notes: 'Future duty week',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z'
  }
];
