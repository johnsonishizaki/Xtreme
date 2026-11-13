import { DutyAssignment } from '../types';

/**
 * Formats YYYY-MM-DD or ISO date string into "13 November 2026"
 */
export function formatDutyDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  } catch {}
  return dateStr;
}

/**
 * Builds the weekly teacher duty announcement from template and assignment data
 */
export function generateAnnouncementMessage(
  template: string,
  assignment: DutyAssignment
): string {
  const teachers = assignment.teachers || [];
  let teachersText = '';

  if (teachers.length === 0) {
    teachersText = 'Pending teacher assignment';
  } else {
    teachersText = teachers
      .map((t, idx) => {
        const cleanRole = t.role && t.role.trim() && t.role.trim().toLowerCase() !== 'teacher'
          ? ` — ${t.role.trim()}`
          : '';
        return `${idx + 1}. ${t.name.trim()}${cleanRole}`;
      })
      .join('\n');
  }

  const startDateFormatted = formatDutyDate(assignment.startDate);
  const endDateFormatted = formatDutyDate(assignment.endDate);
  const weekText = assignment.weekLabel || `${startDateFormatted} – ${endDateFormatted}`;
  const dutyText = assignment.dutyTitle || 'Weekly Duty';

  return template
    .replace(/{TEACHERS}/g, teachersText)
    .replace(/{START_DATE}/g, startDateFormatted)
    .replace(/{END_DATE}/g, endDateFormatted)
    .replace(/{WEEK}/g, weekText)
    .replace(/{DUTY}/g, dutyText)
    .trim();
}

/**
 * Robust clipboard copy optimized for iPhone iOS Safari / PWA and all modern browsers
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard failed, attempting fallback', err);
    }
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback clipboard copy failed', err);
    return false;
  }
}

/**
 * Launches WhatsApp natively on iPhone/Android or via api.whatsapp.com on desktop
 */
export function openWhatsApp(
  message: string,
  behavior: 'app' | 'web' | 'prompt' = 'app',
  phoneNumber?: string
): void {
  const encoded = encodeURIComponent(message);
  const cleanPhone = phoneNumber ? phoneNumber.replace(/[^0-9]/g, '') : '';
  const phoneParam = cleanPhone ? `phone=${cleanPhone}&` : '';

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(navigator.userAgent);

  if (behavior === 'web') {
    window.location.href = `https://api.whatsapp.com/send?${phoneParam}text=${encoded}`;
    return;
  }

  if (isIOS || isAndroid || behavior === 'app') {
    const deepLink = cleanPhone
      ? `whatsapp://send?phone=${cleanPhone}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;
    window.location.href = deepLink;
  } else {
    window.location.href = `https://api.whatsapp.com/send?${phoneParam}text=${encoded}`;
  }
}

/**
 * Formatted WhatsApp message requesting a single houseparent to submit their student count
 */
export function generateHouseRequestWhatsAppMessage(
  house: { id: string; name: string; category: string; expectedStudentCount: number; assignedHouseparent: string },
  dateStr: string,
  formUrl: string
): string {
  const formattedDate = formatDutyDate(dateStr) || dateStr;
  return [
    `📋 HOUSE ATTENDANCE FORM REQUEST`,
    `🏫 House: ${house.name} (${house.category})`,
    `👤 Houseparent: ${house.assignedHouseparent}`,
    `📅 Date: ${formattedDate}`,
    `🎯 Expected Quota: ${house.expectedStudentCount} students`,
    ``,
    `Dear Houseparent, please submit today's number of students present using this official link:`,
    `👉 ${formUrl}`,
    ``,
    `Only the present count, new arrivals (if any), and follow-up notes are needed — missing totals calculate automatically.`,
    ``,
    `— Senior Houseparent, OLAG SHS`
  ].join('\n');
}

/**
 * Formatted WhatsApp broadcast message for all 8 OLAG SHS houses to submit arrival counts
 */
export function generateFormBroadcastWhatsAppMessage(
  dateStr: string,
  formUrl: string
): string {
  const formattedDate = formatDutyDate(dateStr) || dateStr;
  return [
    `📋 OLAG SHS — DAILY HOUSE ARRIVAL REPORT`,
    `📅 Date: ${formattedDate}`,
    ``,
    `Dear Houseparents,`,
    `Please submit today's house attendance count using the official link below:`,
    ``,
    `👉 ${formUrl}`,
    ``,
    `Steps:`,
    `1. Select your House (all 8 OLAG SHS houses)`,
    `2. Enter Number of Students Present`,
    `3. Add New Arrivals & follow-up notes (if any)`,
    ``,
    `Submissions appear automatically in the school overview.`,
    ``,
    `— Senior Houseparent, OLAG SHS`
  ].join('\n');
}

/**
 * Formatted WhatsApp message summarizing a single house's report status
 */
export function generateHouseStatusWhatsAppMessage(
  house: { id: string; name: string; category: string; expectedStudentCount: number; assignedHouseparent: string },
  report: { reportedCount: number; expectedCount?: number; notReportedCount: number; notReportedDetails?: string; updatedAt?: string } | undefined,
  dateStr: string
): string {
  const formattedDate = formatDutyDate(dateStr) || dateStr;
  const expected = report?.expectedCount ?? house.expectedStudentCount;

  if (!report) {
    return [
      `⚠️ HOUSE REPORT PENDING`,
      `🏫 House: ${house.name} (${house.category})`,
      `👤 Houseparent: ${house.assignedHouseparent}`,
      `📅 Date: ${formattedDate}`,
      `🎯 Expected Quota: ${expected} students`,
      ``,
      `No report has been submitted yet for this date. Please submit your student reporting count.`,
      ``,
      `— Senior Houseparent, OLAG SHS`
    ].join('\n');
  }

  const reported = report.reportedCount;
  const notReported = Math.max(0, expected - reported);
  const percentage = expected > 0 ? ((reported / expected) * 100).toFixed(1) : '0';

  const lines = [
    `📊 HOUSE REPORT UPDATE`,
    `🏫 House: ${house.name} (${house.category})`,
    `📅 Date: ${formattedDate}`,
    `👤 Houseparent: ${house.assignedHouseparent}`,
    ``,
    `✅ Students Reported: ${reported} / ${expected} (${percentage}%)`,
    `⏳ Not Yet Reported: ${notReported}`
  ];

  if (report.notReportedDetails && report.notReportedDetails.trim()) {
    lines.push(`📝 Follow-up Notes: ${report.notReportedDetails.trim()}`);
  }

  lines.push(``, `— Senior Houseparent, OLAG SHS`);
  return lines.join('\n');
}

/**
 * Clean, plain-Unicode WhatsApp & Notes summary for the full 8-house school collation
 */
export function generateFullCollationWhatsAppMessage(
  collation: {
    totalExpected: number;
    totalReported: number;
    totalNotReported: number;
    reportingPercentage: number;
    reportsReceivedCount: number;
    totalHousesCount: number;
    boysExpected: number;
    boysReported: number;
    boysNotReported: number;
    boysPercentage: number;
    girlsExpected: number;
    girlsReported: number;
    girlsNotReported: number;
    girlsPercentage: number;
    missingHouseIds: string[];
  },
  houses: Array<{ id: string; name: string; category: string }>,
  dateReportsMap: Map<string, { reportedCount: number; notReportedCount: number; expectedCount: number; notReportedDetails?: string }>,
  dateStr: string
): string {
  const formattedDate = formatDutyDate(dateStr) || dateStr;
  const boysCount = houses.filter(h => h.category === 'Boys').length || 4;
  const girlsCount = houses.filter(h => h.category === 'Girls').length || 4;

  const lines: string[] = [
    `📢 TERM OPENING SCHOOL REPORT`,
    `📅 Date: ${formattedDate}`,
    ``,
    `📊 OVERALL TOTALS`,
    `• Total Expected: ${collation.totalExpected}`,
    `• Total Reported: ${collation.totalReported} (${collation.reportingPercentage}%)`,
    `• Not Yet Reported: ${collation.totalNotReported}`,
    `• Reports Received: ${collation.reportsReceivedCount} of ${collation.totalHousesCount} Houses`,
    ``,
    `👦 BOYS HOUSES (${boysCount}): ${collation.boysReported}/${collation.boysExpected} (${collation.boysPercentage}%)`,
    `👧 GIRLS HOUSES (${girlsCount}): ${collation.girlsReported}/${collation.girlsExpected} (${collation.girlsPercentage}%)`,
    ``,
    `🏫 ${collation.totalHousesCount} HOUSES BREAKDOWN`
  ];

  for (const h of houses) {
    const rep = dateReportsMap.get(h.id);
    if (rep) {
      const pct = rep.expectedCount > 0 ? Math.round((rep.reportedCount / rep.expectedCount) * 100) : 0;
      const pendingSuffix = rep.notReportedCount > 0 ? ` — ${rep.notReportedCount} pending` : '';
      lines.push(`✅ ${h.name}: ${rep.reportedCount}/${rep.expectedCount} (${pct}%)${pendingSuffix}`);
    } else {
      lines.push(`⏳ ${h.name}: Report pending`);
    }
  }

  if (collation.missingHouseIds.length > 0) {
    const missingNames = collation.missingHouseIds
      .map(id => houses.find(h => h.id === id)?.name || id)
      .join(', ');
    lines.push(``, `⚠️ Missing Reports: ${missingNames}`);
  }

  const followUps: string[] = [];
  houses.forEach(h => {
    const rep = dateReportsMap.get(h.id);
    if (rep && rep.notReportedDetails && rep.notReportedDetails.trim()) {
      followUps.push(`• ${h.name}: ${rep.notReportedDetails.trim()}`);
    }
  });

  if (followUps.length > 0) {
    lines.push(``, `📝 Follow-up Notes:`, ...followUps);
  }

  lines.push(``, `— Senior Houseparent, OLAG SHS`);
  return lines.join('\n');
}
