import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import {
  AcademicTerm,
  DailyCollation,
  DutyAssignment,
  HouseConfig,
  HouseDailyReport,
  Roster,
  SendHistory
} from '../types';
import { formatDutyDate, formatSlashDate, generateAnnouncementMessage, getLocalTodayIso } from './messageGenerator';

export type ExportFormat = 'pdf' | 'excel' | 'word';

export interface AttendanceExportInput {
  collation: DailyCollation;
  houses: HouseConfig[];
  reports: HouseDailyReport[];
  dateReportsMap: Map<string, HouseDailyReport>;
  selectedDate: string;
  activeTerm: AcademicTerm;
  assignments?: DutyAssignment[];
}

export interface DutyExportInput {
  roster: Roster | null;
  assignments: DutyAssignment[];
  sendHistory: SendHistory[];
  currentAssignment: DutyAssignment | null;
  messageTemplate: string;
}

interface RenderedChartAsset {
  dataUrl: string;
  bytes: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function sanitizeFilePart(val: string): string {
  return (val || 'report')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Renders high-resolution, print-ready PNG graphs (Overall Donut, Boys vs Girls Cohort Bars,
 * 8-House Quota Attainment Horizontal Bars, and Multi-Day Trend Bar Chart) for PDF & Word embedding.
 */
export function renderAttendanceChartsAsset(
  input: AttendanceExportInput
): RenderedChartAsset | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const activeHouses = [...input.houses]
    .filter(h => h.active)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  // Build daily trend points
  const byDate = new Map<string, { reported: number; expected: number }>();
  const defaultExpected =
    activeHouses.reduce((acc, h) => acc + h.expectedStudentCount, 0) ||
    input.collation.totalExpected ||
    949;
  for (const r of input.reports) {
    if (!r.reportingDate) continue;
    const cur = byDate.get(r.reportingDate) || { reported: 0, expected: defaultExpected };
    cur.reported += r.reportedCount || 0;
    byDate.set(r.reportingDate, cur);
  }
  const dailyTrend = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, vals]) => ({
      label: date.slice(5),
      reported: vals.reported,
      pct: vals.expected > 0 ? Math.min(100, Math.round((vals.reported / vals.expected) * 100)) : 0
    }));

  const hasTrend = dailyTrend.length > 1;
  const houseRows = Math.ceil(Math.max(1, activeHouses.length) / 2);
  const logicalWidth = 1040;
  const logicalHeight = 250 + houseRows * 46 + (hasTrend ? 210 : 30);
  const scale = 2;

  canvas.width = logicalWidth * scale;
  canvas.height = logicalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(scale, scale);

  // Clean light canvas background for crisp printing in PDF/Word
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  // Outer subtle frame
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 8, 8, logicalWidth - 16, logicalHeight - 16, 16);
  ctx.stroke();

  // Top section: Donut + Cohort Comparison
  const pctClamped = Math.max(0, Math.min(100, input.collation.reportingPercentage));
  const cx = 115;
  const cy = 115;
  const donutRadius = 64;

  // Track ring
  ctx.beginPath();
  ctx.arc(cx, cy, donutRadius, 0, Math.PI * 2);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 16;
  ctx.stroke();

  // Active emerald arc
  if (pctClamped > 0) {
    ctx.beginPath();
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * pctClamped) / 100;
    ctx.arc(cx, cy, donutRadius, startAngle, endAngle);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${pctClamped}%`, cx, cy - 6);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 11px sans-serif';
  ctx.fillText('REPORTED', cx, cy + 16);

  // Cohort Comparison Bars
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Cohort Attendance Split (Boys vs Girls)', 230, 56);

  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    `${input.collation.totalReported} of ${input.collation.totalExpected} students present  •  ${input.collation.reportsReceivedCount}/${input.collation.totalHousesCount} houses submitted`,
    230,
    76
  );

  const cohortBarX = 230;
  const cohortBarW = 760;

  const cohorts = [
    {
      label: 'Boys Houses',
      reported: input.collation.boysReported,
      expected: input.collation.boysExpected,
      pct: input.collation.boysPercentage,
      color: '#2563eb',
      y: 105
    },
    {
      label: 'Girls Houses',
      reported: input.collation.girlsReported,
      expected: input.collation.girlsExpected,
      pct: input.collation.girlsPercentage,
      color: '#db2777',
      y: 162
    }
  ];

  for (const c of cohorts) {
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(c.label, cohortBarX, c.y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${c.reported}/${c.expected} (${c.pct}%)`, cohortBarX + cohortBarW, c.y);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#f1f5f9';
    drawRoundedRect(ctx, cohortBarX, c.y + 8, cohortBarW, 14, 7);
    ctx.fill();

    const fillW = c.reported > 0 ? Math.max(12, (Math.min(100, c.pct) / 100) * cohortBarW) : 0;
    if (fillW > 0) {
      ctx.fillStyle = c.color;
      drawRoundedRect(ctx, cohortBarX, c.y + 8, fillW, 14, 7);
      ctx.fill();
    }
  }

  // Divider
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, 224);
  ctx.lineTo(logicalWidth - 32, 224);
  ctx.stroke();

  // Middle section: House-by-House Horizontal Bar Chart
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('House-by-House Quota Attainment', 36, 254);

  const colW = 468;
  const startY = 282;
  activeHouses.forEach((h, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 36 + col * 500;
    const y = startY + row * 46;

    const rep = input.dateReportsMap.get(h.id);
    const expected = rep ? rep.expectedCount : h.expectedStudentCount;
    const reported = rep ? rep.reportedCount : 0;
    const pct = expected > 0 ? Math.min(100, Math.round((reported / expected) * 100)) : 0;

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(h.name, x, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = rep ? '#334155' : '#b45309';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(
      rep ? `${reported}/${expected} (${pct}%)` : `0/${expected} (Missing)`,
      x + colW,
      y
    );
    ctx.textAlign = 'left';

    ctx.fillStyle = '#f1f5f9';
    drawRoundedRect(ctx, x, y + 7, colW, 12, 6);
    ctx.fill();

    const barColor = !rep
      ? '#f59e0b'
      : pct >= 100
        ? '#10b981'
        : h.category === 'Boys'
          ? '#2563eb'
          : '#db2777';

    const fillW = reported > 0 ? Math.max(10, (pct / 100) * colW) : 0;
    if (fillW > 0) {
      ctx.fillStyle = barColor;
      drawRoundedRect(ctx, x, y + 7, fillW, 12, 6);
      ctx.fill();
    }
  });

  // Bottom section: Multi-Day Reporting Trend Graph (when >1 day exists)
  if (hasTrend) {
    const trendTop = startY + houseRows * 46 + 18;
    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(32, trendTop);
    ctx.lineTo(logicalWidth - 32, trendTop);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Multi-Day Reporting Trend', 36, trendTop + 30);

    const chartX = 52;
    const chartY = trendTop + 48;
    const chartW = logicalWidth - 104;
    const chartH = 104;

    // Baseline
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(chartX, chartY + chartH);
    ctx.lineTo(chartX + chartW, chartY + chartH);
    ctx.stroke();

    const slotW = chartW / dailyTrend.length;
    const barW = Math.min(72, slotW * 0.55);

    dailyTrend.forEach((d, idx) => {
      const bx = chartX + idx * slotW + (slotW - barW) / 2;
      const bh = Math.max(8, (d.pct / 100) * (chartH - 18));
      const by = chartY + chartH - bh;

      ctx.fillStyle = '#10b981';
      drawRoundedRect(ctx, bx, by, barW, bh, 6);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${d.reported} (${d.pct}%)`, bx + barW / 2, by - 6);

      ctx.fillStyle = '#64748b';
      ctx.font = '600 11px monospace';
      ctx.fillText(d.label, bx + barW / 2, chartY + chartH + 16);
    });
    ctx.textAlign = 'left';
  }

  const dataUrl = canvas.toDataURL('image/png');
  return {
    dataUrl,
    bytes: dataUrlToUint8Array(dataUrl),
    pixelWidth: logicalWidth,
    pixelHeight: logicalHeight
  };
}

/**
 * Renders a crisp summary bar chart for the Duty Schedule PDF/Word export.
 */
export function renderDutyChartAsset(input: DutyExportInput): RenderedChartAsset | null {
  if (typeof document === 'undefined' || input.assignments.length === 0) return null;
  const sentSet = new Set(
    input.sendHistory.filter(h => h.status === 'sent_confirmed').map(h => h.assignmentId)
  );
  const total = input.assignments.length;
  const sentCount = input.assignments.filter(a => sentSet.has(a.id)).length;
  const pendingCount = Math.max(0, total - sentCount);
  const pct = total > 0 ? Math.round((sentCount / total) * 100) : 0;

  const logicalWidth = 1040;
  const logicalHeight = 160;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = logicalWidth * scale;
  canvas.height = logicalHeight * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 8, 8, logicalWidth - 16, logicalHeight - 16, 16);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(
    `Duty Dispatch Completion: ${sentCount} of ${total} Weeks Sent (${pct}%)`,
    36,
    46
  );

  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    `Roster: ${input.roster?.name || 'Active Duty Schedule'}  •  Sent: ${sentCount}  •  Pending: ${pendingCount}`,
    36,
    68
  );

  const barX = 36;
  const barY = 92;
  const barW = logicalWidth - 72;
  ctx.fillStyle = '#fef3c7';
  drawRoundedRect(ctx, barX, barY, barW, 24, 12);
  ctx.fill();

  const fillW = sentCount > 0 ? Math.max(24, (pct / 100) * barW) : 0;
  if (fillW > 0) {
    ctx.fillStyle = '#10b981';
    drawRoundedRect(ctx, barX, barY, fillW, 24, 12);
    ctx.fill();
  }

  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`Sent (${sentCount})`, barX + 8, barY + 42);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#b45309';
  ctx.fillText(`Pending (${pendingCount})`, barX + barW - 8, barY + 42);

  const dataUrl = canvas.toDataURL('image/png');
  return {
    dataUrl,
    bytes: dataUrlToUint8Array(dataUrl),
    pixelWidth: logicalWidth,
    pixelHeight: logicalHeight
  };
}

function buildTrendRows(reports: HouseDailyReport[], houses: HouseConfig[]) {
  const defaultExpected =
    houses.filter(h => h.active).reduce((acc, h) => acc + h.expectedStudentCount, 0) || 949;
  const byDate = new Map<string, { reported: number; housesIn: number }>();
  for (const r of reports) {
    if (!r.reportingDate) continue;
    const cur = byDate.get(r.reportingDate) || { reported: 0, housesIn: 0 };
    cur.reported += Number(r.reportedCount) || 0;
    cur.housesIn += 1;
    byDate.set(r.reportingDate, cur);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, v]) => {
      const notRep = Math.max(0, defaultExpected - v.reported);
      const pct = defaultExpected > 0 ? Number(((v.reported / defaultExpected) * 100).toFixed(1)) : 0;
      return {
        date,
        housesIn: v.housesIn,
        expected: defaultExpected,
        reported: v.reported,
        notReported: notRep,
        pct
      };
    });
}

export async function exportAttendanceReport(
  format: ExportFormat,
  input: AttendanceExportInput
): Promise<string> {
  const activeHouses = [...input.houses]
    .filter(h => h.active)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  const isMidTerm =
    input.activeTerm.termType === 'midterm' ||
    input.activeTerm.termName.toLowerCase().includes('mid');
  const periodLabel = `${input.activeTerm.termName}${isMidTerm ? ' (Mid-Term)' : ''} · ${input.activeTerm.academicYear}`;
  const formattedDate = formatDutyDate(input.selectedDate) || input.selectedDate;
  const baseFilename = `OLAG_SHS_Attendance_${sanitizeFilePart(input.selectedDate)}`;

  const houseTableRows = activeHouses.map((h, idx) => {
    const rep = input.dateReportsMap.get(h.id);
    const expected = rep ? rep.expectedCount : h.expectedStudentCount;
    const reported = rep ? rep.reportedCount : 0;
    const pending = rep ? rep.notReportedCount : expected;
    const pct = expected > 0 ? Number(((reported / expected) * 100).toFixed(1)) : 0;
    const status = !rep ? 'Missing' : pending === 0 ? 'Full' : `${pending} Pending`;
    return {
      order: idx + 1,
      name: h.name,
      category: h.category,
      houseparent: h.assignedHouseparent || 'Houseparent',
      phone: h.houseparentPhone || '-',
      expected,
      reported,
      pending,
      pct,
      status,
      followUp: rep?.notReportedDetails?.trim() || '-',
      source: rep?.source || 'pending'
    };
  });

  const trendRows = buildTrendRows(input.reports, input.houses);

  if (format === 'excel') {
    const wb = XLSX.utils.book_new();

    const summarySheetData = [
      ['OLAG SHS — HOUSE ATTENDANCE & COLLATION REPORT'],
      ['Period', periodLabel],
      ['Reporting Date', formattedDate],
      ['Generated At', new Date().toLocaleString()],
      [],
      ['Metric', 'Value', 'Rate / Notes'],
      ['Total Quota', input.collation.totalExpected, 'All active houses'],
      ['Students Reported', input.collation.totalReported, `${input.collation.reportingPercentage}%`],
      ['Not Yet Reported', input.collation.totalNotReported, 'Pending return'],
      ['Houses Submitted', `${input.collation.reportsReceivedCount} / ${input.collation.totalHousesCount}`, `${input.collation.missingHouseIds.length} missing`],
      ['Boys Houses', `${input.collation.boysReported} / ${input.collation.boysExpected}`, `${input.collation.boysPercentage}%`],
      ['Girls Houses', `${input.collation.girlsReported} / ${input.collation.girlsExpected}`, `${input.collation.girlsPercentage}%`]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
    wsSummary['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    const housesSheetData = [
      ['#', 'House', 'Category', 'Houseparent', 'Phone', 'Quota', 'Reported', 'Pending', 'Attainment %', 'Status', 'Follow-Up Notes'],
      ...houseTableRows.map(r => [
        r.order,
        r.name,
        r.category,
        r.houseparent,
        r.phone,
        r.expected,
        r.reported,
        r.pending,
        `${r.pct}%`,
        r.status,
        r.followUp
      ])
    ];
    const wsHouses = XLSX.utils.aoa_to_sheet(housesSheetData);
    wsHouses['!cols'] = [
      { wch: 4 },
      { wch: 20 },
      { wch: 10 },
      { wch: 22 },
      { wch: 15 },
      { wch: 9 },
      { wch: 10 },
      { wch: 10 },
      { wch: 13 },
      { wch: 14 },
      { wch: 38 }
    ];
    XLSX.utils.book_append_sheet(wb, wsHouses, 'Houses Breakdown');

    if (trendRows.length > 0) {
      const trendSheetData = [
        ['Date', 'Houses In', 'Expected', 'Reported', 'Pending', 'Attainment %'],
        ...trendRows.map(t => [t.date, t.housesIn, t.expected, t.reported, t.notReported, `${t.pct}%`])
      ];
      const wsTrend = XLSX.utils.aoa_to_sheet(trendSheetData);
      wsTrend['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsTrend, 'Daily Trend');
    }

    if (input.assignments && input.assignments.length > 0) {
      const dutySheetData = [
        ['Week', 'Start Date', 'End Date', 'Duty Title', 'Teachers On Duty'],
        ...input.assignments.map(a => [
          a.weekLabel,
          formatSlashDate(a.startDate),
          formatSlashDate(a.endDate),
          a.dutyTitle || 'Weekly Duty',
          (a.teachers || []).map(t => t.name).join(', ')
        ])
      ];
      const wsDuty = XLSX.utils.aoa_to_sheet(dutySheetData);
      wsDuty['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 48 }];
      XLSX.utils.book_append_sheet(wb, wsDuty, 'Duty Schedule');
    }

    const outBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const filename = `${baseFilename}.xlsx`;
    triggerBlobDownload(
      new Blob([outBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      filename
    );
    return filename;
  }

  const chartAsset = renderAttendanceChartsAsset(input);

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // Header bar
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('OLAG SHS — ATTENDANCE & GRAPHS REPORT', 14, 11);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${periodLabel}   |   Date: ${formattedDate}`, 14, 18.5);

    // KPI Summary Table
    autoTable(doc, {
      startY: 30,
      head: [['Metric', 'Reported', 'Quota', 'Pending', 'Rate']],
      body: [
        [
          'Overall School',
          String(input.collation.totalReported),
          String(input.collation.totalExpected),
          String(input.collation.totalNotReported),
          `${input.collation.reportingPercentage}% (${input.collation.reportsReceivedCount}/${input.collation.totalHousesCount} houses)`
        ],
        [
          'Boys Houses',
          String(input.collation.boysReported),
          String(input.collation.boysExpected),
          String(input.collation.boysNotReported),
          `${input.collation.boysPercentage}%`
        ],
        [
          'Girls Houses',
          String(input.collation.girlsReported),
          String(input.collation.girlsExpected),
          String(input.collation.girlsNotReported),
          `${input.collation.girlsPercentage}%`
        ]
      ],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: 14, right: 14 }
    });

    let nextY = ((doc as any).lastAutoTable?.finalY || 62) + 6;

    // Embed Visual Charts Image
    if (chartAsset) {
      const imgWidthMm = pageW - 28;
      const imgHeightMm = (chartAsset.pixelHeight / chartAsset.pixelWidth) * imgWidthMm;
      if (nextY + imgHeightMm > doc.internal.pageSize.getHeight() - 18) {
        doc.addPage();
        nextY = 14;
      }
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Visual Analytics & Attainment Graphs', 14, nextY);
      doc.addImage(chartAsset.dataUrl, 'PNG', 14, nextY + 3, imgWidthMm, imgHeightMm);
      nextY += imgHeightMm + 10;
    }

    if (nextY > doc.internal.pageSize.getHeight() - 55) {
      doc.addPage();
      nextY = 14;
    }

    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('House-by-House Data Breakdown', 14, nextY);

    autoTable(doc, {
      startY: nextY + 3,
      head: [['House', 'Group', 'Houseparent', 'Quota', 'Reported', 'Pending', 'Rate', 'Status']],
      body: houseTableRows.map(r => [
        r.name,
        r.category,
        r.houseparent,
        String(r.expected),
        String(r.reported),
        String(r.pending),
        `${r.pct}%`,
        r.status
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      margin: { left: 14, right: 14 }
    });

    const followUps = houseTableRows.filter(r => r.followUp !== '-');
    if (followUps.length > 0) {
      const fy = ((doc as any).lastAutoTable?.finalY || nextY + 50) + 8;
      autoTable(doc, {
        startY: fy,
        head: [['House', 'Follow-Up Notes']],
        body: followUps.map(f => [f.name, f.followUp]),
        theme: 'grid',
        headStyles: { fillColor: [217, 119, 6], textColor: [255, 255, 255], fontSize: 8.5 },
        bodyStyles: { fontSize: 8.5 },
        margin: { left: 14, right: 14 }
      });
    }

    const filename = `${baseFilename}.pdf`;
    triggerBlobDownload(doc.output('blob'), filename);
    return filename;
  }

  // Word (.docx)
  const docChildren: Array<Paragraph | Table> = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: 'OLAG SHS — HOUSE ATTENDANCE & ANALYTICS REPORT',
          bold: true,
          size: 28,
          color: '0f172a'
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 220 },
      children: [
        new TextRun({
          text: `${periodLabel}   •   Reporting Date: ${formattedDate}`,
          size: 20,
          color: '475569'
        })
      ]
    }),
    createDocxTable(
      ['Category', 'Reported', 'Quota', 'Pending', 'Rate'],
      [
        [
          'Overall School',
          String(input.collation.totalReported),
          String(input.collation.totalExpected),
          String(input.collation.totalNotReported),
          `${input.collation.reportingPercentage}% (${input.collation.reportsReceivedCount}/${input.collation.totalHousesCount} houses)`
        ],
        [
          'Boys Houses',
          String(input.collation.boysReported),
          String(input.collation.boysExpected),
          String(input.collation.boysNotReported),
          `${input.collation.boysPercentage}%`
        ],
        [
          'Girls Houses',
          String(input.collation.girlsReported),
          String(input.collation.girlsExpected),
          String(input.collation.girlsNotReported),
          `${input.collation.girlsPercentage}%`
        ]
      ]
    )
  ];

  if (chartAsset) {
    const docImgWidth = 600;
    const docImgHeight = Math.round((chartAsset.pixelHeight / chartAsset.pixelWidth) * docImgWidth);
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: 'Visual Graphs & Attainment Breakdown', bold: true, size: 24 })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 220 },
        children: [
          new ImageRun({
            type: 'png',
            data: chartAsset.bytes,
            transformation: {
              width: docImgWidth,
              height: docImgHeight
            }
          })
        ]
      })
    );
  }

  docChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 220, after: 120 },
      children: [new TextRun({ text: 'House-by-House Data Table', bold: true, size: 24 })]
    }),
    createDocxTable(
      ['House', 'Group', 'Houseparent', 'Quota', 'Reported', 'Pending', 'Rate', 'Status'],
      houseTableRows.map(r => [
        r.name,
        r.category,
        r.houseparent,
        String(r.expected),
        String(r.reported),
        String(r.pending),
        `${r.pct}%`,
        r.status
      ])
    )
  );

  const followUps = houseTableRows.filter(r => r.followUp !== '-');
  if (followUps.length > 0) {
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 100 },
        children: [new TextRun({ text: 'Follow-Up Notes', bold: true, size: 24 })]
      }),
      ...followUps.map(
        f =>
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: `${f.name}: `, bold: true, size: 20 }),
              new TextRun({ text: f.followUp, size: 20 })
            ]
          })
      )
    );
  }

  const wordDoc = new Document({
    sections: [{ children: docChildren }]
  });
  const blob = await Packer.toBlob(wordDoc);
  const filename = `${baseFilename}.docx`;
  triggerBlobDownload(blob, filename);
  return filename;
}

export async function exportDutySchedule(
  format: ExportFormat,
  input: DutyExportInput
): Promise<string> {
  const sorted = [...input.assignments].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const sentIds = new Set(
    input.sendHistory.filter(h => h.status === 'sent_confirmed').map(h => h.assignmentId)
  );
  const baseFilename = `OLAG_SHS_Duty_Schedule_${sanitizeFilePart(input.roster?.name || 'Active')}`;

  const rows = sorted.map((a, idx) => {
    const teachers = a.teachers || [];
    const leader =
      teachers.find(t => (t.role || '').toLowerCase().includes('leader'))?.name ||
      teachers[0]?.name ||
      'TBD';
    return {
      index: idx + 1,
      weekLabel: a.weekLabel,
      start: formatSlashDate(a.startDate),
      end: formatSlashDate(a.endDate),
      dutyTitle: a.dutyTitle || 'Weekly Duty',
      leader: leader.toUpperCase(),
      teachers: teachers.map(t => t.name.toUpperCase()).join(', '),
      status: sentIds.has(a.id) ? 'Sent' : 'Pending'
    };
  });

  if (format === 'excel') {
    const wb = XLSX.utils.book_new();
    const sheetRows = [
      ['OLAG SHS — TEACHER DUTY ROSTER'],
      ['Roster Name', input.roster?.name || 'Active Schedule'],
      ['Total Weeks', sorted.length],
      [],
      ['#', 'Week', 'Start', 'End', 'Duty Title', 'Team Leader', 'Teachers On Duty', 'Status'],
      ...rows.map(r => [r.index, r.weekLabel, r.start, r.end, r.dutyTitle, r.leader, r.teachers, r.status])
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    ws['!cols'] = [
      { wch: 4 },
      { wch: 14 },
      { wch: 13 },
      { wch: 13 },
      { wch: 20 },
      { wch: 24 },
      { wch: 48 },
      { wch: 11 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Duty Schedule');

    if (input.currentAssignment) {
      const msg = generateAnnouncementMessage(input.messageTemplate, input.currentAssignment);
      const wsMsg = XLSX.utils.aoa_to_sheet(msg.split('\n').map(line => [line]));
      wsMsg['!cols'] = [{ wch: 90 }];
      XLSX.utils.book_append_sheet(wb, wsMsg, 'Current Announcement');
    }

    const outBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const filename = `${baseFilename}.xlsx`;
    triggerBlobDownload(
      new Blob([outBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      filename
    );
    return filename;
  }

  const chartAsset = renderDutyChartAsset(input);

  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('OLAG SHS — TEACHER DUTY SCHEDULE', 14, 11);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${input.roster?.name || 'Active Roster'}   |   ${sorted.length} Weeks`, 14, 18.5);

    let nextY = 30;
    if (chartAsset) {
      const imgWidthMm = pageW - 28;
      const imgHeightMm = (chartAsset.pixelHeight / chartAsset.pixelWidth) * imgWidthMm;
      doc.addImage(chartAsset.dataUrl, 'PNG', 14, nextY, imgWidthMm, imgHeightMm);
      nextY += imgHeightMm + 8;
    }

    autoTable(doc, {
      startY: nextY,
      head: [['Week', 'Period', 'Team Leader', 'Teachers On Duty', 'Status']],
      body: rows.map(r => [
        r.weekLabel,
        `${r.start} – ${r.end}`,
        r.leader,
        r.teachers,
        r.status
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      margin: { left: 14, right: 14 }
    });

    if (input.currentAssignment) {
      const msg = generateAnnouncementMessage(input.messageTemplate, input.currentAssignment);
      const afterY = ((doc as any).lastAutoTable?.finalY || nextY + 60) + 8;
      autoTable(doc, {
        startY: afterY,
        head: [[`Formatted Announcement (${input.currentAssignment.weekLabel})`]],
        body: [[msg]],
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129], textColor: [15, 23, 42], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 14 }
      });
    }

    const filename = `${baseFilename}.pdf`;
    triggerBlobDownload(doc.output('blob'), filename);
    return filename;
  }

  // Word (.docx)
  const docChildren: Array<Paragraph | Table> = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: 'OLAG SHS — TEACHER DUTY SCHEDULE',
          bold: true,
          size: 28,
          color: '0f172a'
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: `${input.roster?.name || 'Active Roster'}   •   ${sorted.length} Weeks`,
          size: 20,
          color: '475569'
        })
      ]
    })
  ];

  if (chartAsset) {
    const docImgWidth = 600;
    const docImgHeight = Math.round((chartAsset.pixelHeight / chartAsset.pixelWidth) * docImgWidth);
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new ImageRun({
            type: 'png',
            data: chartAsset.bytes,
            transformation: { width: docImgWidth, height: docImgHeight }
          })
        ]
      })
    );
  }

  docChildren.push(
    createDocxTable(
      ['Week', 'Period', 'Leader', 'Teachers On Duty', 'Status'],
      rows.map(r => [r.weekLabel, `${r.start} – ${r.end}`, r.leader, r.teachers, r.status])
    )
  );

  if (input.currentAssignment) {
    const msg = generateAnnouncementMessage(input.messageTemplate, input.currentAssignment);
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 260, after: 100 },
        children: [
          new TextRun({
            text: `Formatted Announcement (${input.currentAssignment.weekLabel})`,
            bold: true,
            size: 24
          })
        ]
      }),
      ...msg.split('\n').map(
        line =>
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: line || ' ', size: 19 })]
          })
      )
    );
  }

  const wordDoc = new Document({ sections: [{ children: docChildren }] });
  const blob = await Packer.toBlob(wordDoc);
  const filename = `${baseFilename}.docx`;
  triggerBlobDownload(blob, filename);
  return filename;
}

function createDocxTable(headers: string[], rows: string[][]): Table {
  const borderSpec = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: 'CBD5E1'
  };
  const borders = {
    top: borderSpec,
    bottom: borderSpec,
    left: borderSpec,
    right: borderSpec,
    insideHorizontal: borderSpec,
    insideVertical: borderSpec
  };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      h =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F172A' },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })]
            })
          ]
        })
    )
  });

  const bodyRows = rows.map(
    (cells, rowIdx) =>
      new TableRow({
        children: cells.map(
          val =>
            new TableCell({
              shading:
                rowIdx % 2 === 1
                  ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F8FAFC' }
                  : undefined,
              margins: { top: 70, bottom: 70, left: 100, right: 100 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: val, size: 18, color: '0F172A' })]
                })
              ]
            })
        )
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [headerRow, ...bodyRows]
  });
}

// ============================================================================
// STRUCTURED JSON AGGREGATION -> SHEETJS EXCEL / CSV EXPORT (SETTINGS TAB)
// ============================================================================

export interface AggregateOperationalParams {
  houses: HouseConfig[];
  reports: HouseDailyReport[];
  activeTerm: AcademicTerm;
  selectedDate?: string;
  rosters?: Roster[];
  assignments?: DutyAssignment[];
  sendHistory?: SendHistory[];
}

export interface AggregatedOperationalSnapshot {
  generatedAt: string;
  dutyRosterStats: {
    rosterId: string | null;
    rosterName: string;
    totalWeeks: number;
    sentWeeksCount: number;
    pendingWeeksCount: number;
    completionPercentage: number;
    uniqueTeachersCount: number;
    currentWeekLabel: string;
    currentWeekTeachers: string[];
  };
  attendanceSummary: {
    termId: string;
    termName: string;
    termType: 'term' | 'midterm';
    academicYear: string;
    reportingDate: string;
    totalActiveHouses: number;
    reportsReceivedCount: number;
    missingHousesCount: number;
    totalExpected: number;
    totalReported: number;
    totalNotReported: number;
    reportingPercentage: number;
    boysReported: number;
    boysExpected: number;
    boysPercentage: number;
    girlsReported: number;
    girlsExpected: number;
    girlsPercentage: number;
  };
  housesBreakdown: Array<{
    houseId: string;
    houseName: string;
    category: string;
    assignedHouseparent: string;
    phone: string;
    expectedCount: number;
    reportedCount: number;
    notReportedCount: number;
    reportingPercentage: number;
    status: string;
    followUpNotes: string;
    reportingDate: string;
  }>;
  dutyAssignments: Array<{
    weekLabel: string;
    startDate: string;
    endDate: string;
    dutyTitle: string;
    teamLeader: string;
    teachers: string;
    status: 'Sent' | 'Pending';
  }>;
  dailyTrendSummaries: Array<{
    reportingDate: string;
    housesSubmitted: number;
    totalExpected: number;
    totalReported: number;
    totalNotReported: number;
    reportingPercentage: number;
  }>;
}

/**
 * Aggregates current duty roster statistics and attendance summaries into a structured JSON object
 * ready for SheetJS conversion into CSV or multi-sheet Excel (.xlsx).
 */
export function aggregateOperationalSnapshot(
  params: AggregateOperationalParams
): AggregatedOperationalSnapshot {
  const {
    houses = [],
    reports = [],
    activeTerm,
    rosters = [],
    assignments = [],
    sendHistory = []
  } = params;

  const todayStr = getLocalTodayIso();
  let reportingDate = params.selectedDate || todayStr;
  const hasReportsForRequestedDate = reports.some(r => r.reportingDate === reportingDate);
  if (!hasReportsForRequestedDate && reports.length > 0 && !params.selectedDate) {
    const latest = reports
      .map(r => r.reportingDate)
      .filter(Boolean)
      .sort()
      .reverse()[0];
    if (latest) reportingDate = latest;
  }

  const activeHouses = [...houses]
    .filter(h => h.active !== false)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  const dateMap = new Map<string, HouseDailyReport>();
  for (const r of reports) {
    if (r.reportingDate === reportingDate) {
      dateMap.set(r.houseId, r);
    }
  }

  let totalExpected = 0;
  let totalReported = 0;
  let boysExpected = 0;
  let boysReported = 0;
  let girlsExpected = 0;
  let girlsReported = 0;
  let reportsReceivedCount = 0;

  const housesBreakdown = activeHouses.map(h => {
    const rep = dateMap.get(h.id);
    const expected = rep ? rep.expectedCount : h.expectedStudentCount;
    const reported = rep ? rep.reportedCount : 0;
    const notReported = Math.max(0, expected - reported);
    const pct = expected > 0 ? Number(((reported / expected) * 100).toFixed(1)) : 0;

    totalExpected += expected;
    totalReported += reported;
    if (h.category === 'Boys') {
      boysExpected += expected;
      boysReported += reported;
    } else {
      girlsExpected += expected;
      girlsReported += reported;
    }
    if (rep) reportsReceivedCount++;

    return {
      houseId: h.id,
      houseName: h.name,
      category: h.category,
      assignedHouseparent: h.assignedHouseparent || 'Houseparent',
      phone: h.houseparentPhone || '',
      expectedCount: expected,
      reportedCount: reported,
      notReportedCount: notReported,
      reportingPercentage: pct,
      status: !rep ? 'Missing' : notReported === 0 ? 'Full' : `${notReported} Pending`,
      followUpNotes: rep?.notReportedDetails?.trim() || '',
      reportingDate
    };
  });

  const totalNotReported = Math.max(0, totalExpected - totalReported);
  const reportingPercentage =
    totalExpected > 0 ? Number(((totalReported / totalExpected) * 100).toFixed(1)) : 0;
  const boysPercentage =
    boysExpected > 0 ? Number(((boysReported / boysExpected) * 100).toFixed(1)) : 0;
  const girlsPercentage =
    girlsExpected > 0 ? Number(((girlsReported / girlsExpected) * 100).toFixed(1)) : 0;

  const activeRoster = rosters.find(r => r.isActive) || rosters[0] || null;
  const rosterAssignments = activeRoster
    ? assignments.filter(a => a.rosterId === activeRoster.id)
    : assignments;
  const scopedAssignments = (rosterAssignments.length > 0 ? rosterAssignments : assignments)
    .slice()
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const sentIds = new Set(
    sendHistory.filter(h => h.status === 'sent_confirmed').map(h => h.assignmentId)
  );
  const sentWeeksCount = scopedAssignments.filter(a => sentIds.has(a.id)).length;
  const pendingWeeksCount = Math.max(0, scopedAssignments.length - sentWeeksCount);
  const completionPercentage =
    scopedAssignments.length > 0
      ? Number(((sentWeeksCount / scopedAssignments.length) * 100).toFixed(1))
      : 0;

  const uniqueTeacherNames = new Set<string>();
  const dutyAssignments = scopedAssignments.map(a => {
    const teachers = a.teachers || [];
    for (const t of teachers) {
      if (t.name?.trim()) uniqueTeacherNames.add(t.name.trim().toUpperCase());
    }
    const leader =
      teachers.find(t => (t.role || '').toLowerCase().includes('leader'))?.name ||
      teachers[0]?.name ||
      'TBD';
    return {
      weekLabel: a.weekLabel,
      startDate: a.startDate,
      endDate: a.endDate,
      dutyTitle: a.dutyTitle || 'Weekly Duty',
      teamLeader: leader,
      teachers: teachers.map(t => t.name).join(', '),
      status: (sentIds.has(a.id) ? 'Sent' : 'Pending') as 'Sent' | 'Pending'
    };
  });

  const featuredDuty =
    scopedAssignments.find(a => todayStr >= a.startDate && todayStr <= a.endDate) ||
    scopedAssignments.find(a => a.startDate > todayStr) ||
    scopedAssignments[0] ||
    null;

  const trendRaw = buildTrendRows(reports, houses);
  const dailyTrendSummaries = trendRaw.map(t => ({
    reportingDate: t.date,
    housesSubmitted: t.housesIn,
    totalExpected: t.expected,
    totalReported: t.reported,
    totalNotReported: t.notReported,
    reportingPercentage: t.pct
  }));

  const termType: 'term' | 'midterm' =
    activeTerm.termType === 'midterm' ||
    String(activeTerm.termName || '').toLowerCase().includes('mid')
      ? 'midterm'
      : 'term';

  return {
    generatedAt: new Date().toISOString(),
    dutyRosterStats: {
      rosterId: activeRoster?.id || null,
      rosterName: activeRoster?.name || 'No Active Roster',
      totalWeeks: scopedAssignments.length,
      sentWeeksCount,
      pendingWeeksCount,
      completionPercentage,
      uniqueTeachersCount: uniqueTeacherNames.size,
      currentWeekLabel: featuredDuty?.weekLabel || 'None',
      currentWeekTeachers: (featuredDuty?.teachers || []).map(t => t.name)
    },
    attendanceSummary: {
      termId: activeTerm.id,
      termName: activeTerm.termName,
      termType,
      academicYear: activeTerm.academicYear,
      reportingDate,
      totalActiveHouses: activeHouses.length,
      reportsReceivedCount,
      missingHousesCount: Math.max(0, activeHouses.length - reportsReceivedCount),
      totalExpected,
      totalReported,
      totalNotReported,
      reportingPercentage,
      boysReported,
      boysExpected,
      boysPercentage,
      girlsReported,
      girlsExpected,
      girlsPercentage
    },
    housesBreakdown,
    dutyAssignments,
    dailyTrendSummaries
  };
}

/**
 * Converts an AggregatedOperationalSnapshot into a SheetJS multi-sheet WorkBook.
 */
export function convertAggregatedSnapshotToWorkbook(
  snapshot: AggregatedOperationalSnapshot
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const attendanceSheet = XLSX.utils.json_to_sheet([
    {
      'Academic Year': snapshot.attendanceSummary.academicYear,
      'Term / Period': snapshot.attendanceSummary.termName,
      'Period Type': snapshot.attendanceSummary.termType === 'midterm' ? 'Mid-Term' : 'Regular Term',
      'Reporting Date': snapshot.attendanceSummary.reportingDate,
      'Houses Reported': `${snapshot.attendanceSummary.reportsReceivedCount}/${snapshot.attendanceSummary.totalActiveHouses}`,
      'Missing Houses': snapshot.attendanceSummary.missingHousesCount,
      'Total Expected': snapshot.attendanceSummary.totalExpected,
      'Total Reported': snapshot.attendanceSummary.totalReported,
      'Not Reported': snapshot.attendanceSummary.totalNotReported,
      'Overall %': `${snapshot.attendanceSummary.reportingPercentage}%`,
      'Boys Reported': `${snapshot.attendanceSummary.boysReported}/${snapshot.attendanceSummary.boysExpected} (${snapshot.attendanceSummary.boysPercentage}%)`,
      'Girls Reported': `${snapshot.attendanceSummary.girlsReported}/${snapshot.attendanceSummary.girlsExpected} (${snapshot.attendanceSummary.girlsPercentage}%)`,
      'Generated At': snapshot.generatedAt
    }
  ]);
  XLSX.utils.book_append_sheet(wb, attendanceSheet, 'Attendance Summary');

  const dutyStatsSheet = XLSX.utils.json_to_sheet([
    {
      'Active Roster': snapshot.dutyRosterStats.rosterName,
      'Total Duty Weeks': snapshot.dutyRosterStats.totalWeeks,
      'Weeks Sent': snapshot.dutyRosterStats.sentWeeksCount,
      'Weeks Pending': snapshot.dutyRosterStats.pendingWeeksCount,
      'Completion %': `${snapshot.dutyRosterStats.completionPercentage}%`,
      'Unique Teachers': snapshot.dutyRosterStats.uniqueTeachersCount,
      'Current Week': snapshot.dutyRosterStats.currentWeekLabel,
      'Current Teachers': snapshot.dutyRosterStats.currentWeekTeachers.join(', ') || 'TBD'
    }
  ]);
  XLSX.utils.book_append_sheet(wb, dutyStatsSheet, 'Duty Roster Stats');

  const housesSheet = XLSX.utils.json_to_sheet(
    snapshot.housesBreakdown.map(h => ({
      'House': h.houseName,
      'Category': h.category,
      'Houseparent': h.assignedHouseparent,
      'Phone': h.phone || '-',
      'Quota': h.expectedCount,
      'Reported': h.reportedCount,
      'Pending': h.notReportedCount,
      'Rate %': `${h.reportingPercentage}%`,
      'Status': h.status,
      'Follow-Up Notes': h.followUpNotes || '-',
      'Date': h.reportingDate
    }))
  );
  XLSX.utils.book_append_sheet(wb, housesSheet, 'Houses Breakdown');

  const dutyWeeksSheet = XLSX.utils.json_to_sheet(
    snapshot.dutyAssignments.length > 0
      ? snapshot.dutyAssignments.map(d => ({
          'Week': d.weekLabel,
          'Start Date': d.startDate,
          'End Date': d.endDate,
          'Duty Title': d.dutyTitle,
          'Team Leader': d.teamLeader,
          'Teachers On Duty': d.teachers,
          'Status': d.status
        }))
      : [{ Info: 'No duty assignments loaded' }]
  );
  XLSX.utils.book_append_sheet(wb, dutyWeeksSheet, 'Duty Weeks');

  if (snapshot.dailyTrendSummaries.length > 0) {
    const trendSheet = XLSX.utils.json_to_sheet(
      snapshot.dailyTrendSummaries.map(t => ({
        'Date': t.reportingDate,
        'Houses Submitted': t.housesSubmitted,
        'Expected': t.totalExpected,
        'Reported': t.totalReported,
        'Not Reported': t.totalNotReported,
        'Attainment %': `${t.reportingPercentage}%`
      }))
    );
    XLSX.utils.book_append_sheet(wb, trendSheet, 'Daily Trend');
  }

  return wb;
}

/**
 * Converts an AggregatedOperationalSnapshot into a unified CSV string via SheetJS.
 */
export function convertAggregatedSnapshotToCsv(
  snapshot: AggregatedOperationalSnapshot
): string {
  const wb = convertAggregatedSnapshotToWorkbook(snapshot);
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(ws);
    parts.push(`# ${sheetName.toUpperCase()}\n${csv}`);
  }
  return parts.join('\n\n');
}

/**
 * Aggregates current operational data into JSON, converts via SheetJS to Excel (.xlsx) or CSV (.csv),
 * and triggers browser download.
 */
export function exportAggregatedOperationalData(
  params: AggregateOperationalParams,
  format: 'xlsx' | 'csv' = 'xlsx'
): { filename: string; snapshot: AggregatedOperationalSnapshot } {
  const snapshot = aggregateOperationalSnapshot(params);
  const datePart = sanitizeFilePart(snapshot.attendanceSummary.reportingDate);

  if (format === 'csv') {
    const csvContent = convertAggregatedSnapshotToCsv(snapshot);
    const filename = `OLAG_SHS_Operational_Data_${datePart}.csv`;
    triggerBlobDownload(
      new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
      filename
    );
    return { filename, snapshot };
  }

  const wb = convertAggregatedSnapshotToWorkbook(snapshot);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const filename = `OLAG_SHS_Operational_Data_${datePart}.xlsx`;
  triggerBlobDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    filename
  );
  return { filename, snapshot };
}

