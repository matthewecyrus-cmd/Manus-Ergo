/**
 * pdf-comparison.ts — ErgoKit Multi-Session Comparison PDF
 * =========================================================
 * Generates a portable comparison report from 2–N SessionRecords.
 *
 * Layout:
 *   Page 1:  Cover — worker/job name, date range, session count, assessor
 *   Page 2+: One section per session — score cards, sustained peak, tracking quality
 *   Final:   Summary trend chart (RULA + REBA across all sessions, chronological)
 *            plus side-by-side peak score table
 *
 * Uses jsPDF (pure programmatic PDF, no html2canvas).
 */
import type { SessionRecord, RiskLevel, MotionProfileKey } from './ergo-engine';
import { jsPDF } from 'jspdf';
import { MOTION_PROFILES, DEFAULT_MOTION_PROFILE } from './ergo-engine';

// ─── Retroactive tracking quality classification ──────────────────────────────
/**
 * Classify tracking quality at PDF render time using the session's stored motion
 * profile. This ensures sessions recorded before the task-type-aware thresholds
 * were persisted still display the correct badge.
 */
function classifyTrackingQuality(s: SessionRecord): 'good' | 'fair' | 'poor' {
  // Use persisted value if it exists and is a valid classification
  const persisted = (s as any).trackingQuality as string | undefined;
  if (persisted === 'good' || persisted === 'fair' || persisted === 'poor') {
    return persisted;
  }
  // Retroactively classify using the session's stored motion profile
  const profileKey: MotionProfileKey = (s as any).motionProfileKey ?? DEFAULT_MOTION_PROFILE;
  const profile = MOTION_PROFILES[profileKey] ?? MOTION_PROFILES[DEFAULT_MOTION_PROFILE];
  const clampedFrames = s.clampedFrames ?? 0;
  const totalFrames = s.snapshots.length;
  const clampRatio = totalFrames > 0 ? clampedFrames / totalFrames : 0;
  if (clampRatio < profile.trackingGood) return 'good';
  if (clampRatio < profile.trackingFair) return 'fair';
  return 'poor';
}

// ─── Color helpers ─────────────────────────────────────────────────────────────
function riskRgb(level: RiskLevel): [number, number, number] {
  switch (level) {
    case 'very-high': return [239, 68, 68];
    case 'high':      return [249, 115, 22];
    case 'medium':    return [234, 179, 8];
    case 'low':       return [34, 197, 94];
    default:          return [100, 116, 139];
  }
}
function riskLabel(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    negligible: 'Negligible', low: 'Low', medium: 'Medium', high: 'High', 'very-high': 'Very High',
  };
  return map[level] ?? level;
}
function scoreRulaRisk(s: number): RiskLevel {
  return s >= 7 ? 'very-high' : s >= 5 ? 'high' : s >= 3 ? 'medium' : 'low';
}
function scoreRebaRisk(s: number): RiskLevel {
  return s >= 11 ? 'very-high' : s >= 8 ? 'high' : s >= 4 ? 'medium' : 'low';
}
function normalizeRisk(level: string): RiskLevel {
  if (level === 'negligible') return 'negligible';
  if (level === 'very-high') return 'very-high';
  if (level === 'high') return 'high';
  if (level === 'medium') return 'medium';
  return 'low';
}
function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

// ─── Main export ───────────────────────────────────────────────────────────────
export async function exportComparisonPdf(sessions: SessionRecord[]): Promise<void> {
  if (sessions.length === 0) return;

  // Sort chronologically
  const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 16;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  const setFont = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
  };
  const setColor = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);
  const setFill  = (r: number, g: number, b: number) => doc.setFillColor(r, g, b);
  const setDraw  = (r: number, g: number, b: number) => doc.setDrawColor(r, g, b);

  let y = MARGIN;
  let pageNum = 1;

  const drawPageHeader = (subtitle?: string) => {
    // Sky-blue top bar
    setFill(6, 182, 212);
    doc.rect(0, 0, PAGE_W, 5, 'F');
    // Footer
    setFont(7);
    setColor(148, 163, 184);
    doc.text(`ErgoKit — Multi-Session Comparison Report · ${sorted.length} sessions`, MARGIN, PAGE_H - 5);
    doc.text(`Page ${pageNum}`, PAGE_W - MARGIN, PAGE_H - 5, { align: 'right' });
    if (subtitle) {
      setFont(7, 'italic');
      setColor(100, 116, 139);
      doc.text(subtitle, PAGE_W / 2, PAGE_H - 5, { align: 'center' });
    }
    setColor(15, 23, 42);
  };

  const newPage = (subtitle?: string) => {
    doc.addPage();
    pageNum++;
    y = MARGIN;
    drawPageHeader(subtitle);
  };

  const checkPage = (needed: number, subtitle?: string) => {
    if (y + needed > PAGE_H - MARGIN - 8) newPage(subtitle);
  };

  // ─── PAGE 1: Cover ────────────────────────────────────────────────────────────
  drawPageHeader('Cover');
  y = 14;

  // Brand
  setFont(9, 'bold');
  setColor(6, 182, 212);
  doc.text('ErgoKit', MARGIN, y);
  setFont(9);
  setColor(100, 116, 139);
  doc.text('Industrial Ergonomics Assessment', MARGIN + 22, y);
  y += 10;

  // Title
  setFont(22, 'bold');
  setColor(27, 58, 107); // BRAND.navy
  doc.text('Multi-Session Comparison Report', MARGIN, y);
  y += 10;

  // Subtitle — derive a common job/worker name from the most common task name prefix
  const commonTask = sorted[0]?.taskName ?? 'Ergonomics Assessment';
  setFont(12);
  setColor(100, 116, 139);
  doc.text(commonTask, MARGIN, y);
  y += 8;

  // Date range
  const dateFrom = fmtDate(sorted[0].date);
  const dateTo   = fmtDate(sorted[sorted.length - 1].date);
  setFont(9);
  setColor(100, 116, 139);
  doc.text(`Date range: ${dateFrom} — ${dateTo}`, MARGIN, y);
  y += 5;
  doc.text(`Sessions included: ${sorted.length}`, MARGIN, y);
  y += 5;

  // Assessors
  const assessors = Array.from(new Set(sorted.map(s => s.assessor).filter(Boolean))) as string[];
  if (assessors.length > 0) {
    doc.text(`Assessor(s): ${assessors.join(', ')}`, MARGIN, y);
    y += 5;
  }

  // Departments
  const depts = Array.from(new Set(sorted.map(s => s.department).filter(Boolean))) as string[];
  if (depts.length > 0) {
    doc.text(`Department(s): ${depts.join(', ')}`, MARGIN, y);
    y += 5;
  }
  y += 10;

  // Divider
  setDraw(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;

  // Session index table
  setFont(10, 'bold');
  setColor(27, 58, 107);
  doc.text('Sessions at a Glance', MARGIN, y);
  y += 7;

  const colW = [10, 55, 28, 18, 18, 20, 25];
  const headers = ['#', 'Task Name', 'Date', 'RULA', 'REBA', 'Risk', 'Tracking'];
  const colX = colW.reduce<number[]>((acc, w, i) => {
    acc.push(i === 0 ? MARGIN : acc[i - 1] + colW[i - 1]);
    return acc;
  }, []);

  // Header row
  setFill(27, 58, 107);
  doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
  setFont(7, 'bold');
  setColor(255, 255, 255);
  headers.forEach((h, i) => doc.text(h, colX[i] + 1, y + 5));
  y += 7;

  sorted.forEach((s, idx) => {
    checkPage(8);
    const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
    setFill(...bg);
    doc.rect(MARGIN, y, CONTENT_W, 7, 'F');

    const peakRula = s.peakRula ?? Math.round(s.avgRula);
    const peakReba = s.peakReba ?? Math.round(s.avgReba);
    const [rr, rg, rb] = riskRgb(normalizeRisk(s.peakRisk));
    const tq = classifyTrackingQuality(s);
    const tqLabel = tq.charAt(0).toUpperCase() + tq.slice(1);
    const tqColor: [number, number, number] = tq === 'good' ? [34, 197, 94] : tq === 'fair' ? [234, 179, 8] : [239, 68, 68];

    setFont(7);
    setColor(51, 65, 85);
    doc.text(String(idx + 1), colX[0] + 1, y + 5);
    const taskShort = s.taskName.length > 28 ? s.taskName.slice(0, 26) + '…' : s.taskName;
    doc.text(taskShort, colX[1] + 1, y + 5);
    doc.text(fmtDate(s.date), colX[2] + 1, y + 5);

    setFont(7, 'bold');
    setColor(...riskRgb(scoreRulaRisk(peakRula)));
    doc.text(String(peakRula), colX[3] + 1, y + 5);
    setColor(...riskRgb(scoreRebaRisk(peakReba)));
    doc.text(String(peakReba), colX[4] + 1, y + 5);
    setColor(rr, rg, rb);
    doc.text(riskLabel(normalizeRisk(s.peakRisk)), colX[5] + 1, y + 5);
    setColor(...tqColor);
    doc.text(tqLabel, colX[6] + 1, y + 5);

    y += 7;
  });
  y += 8;

  // ─── Per-session pages ────────────────────────────────────────────────────────
  for (let si = 0; si < sorted.length; si++) {
    const s = sorted[si];
    newPage(`Session ${si + 1} of ${sorted.length}`);
    y = 14;

    // Session heading — always append the motion profile label in parentheses.
    // Strip any existing trailing parenthetical from the task name first to avoid
    // double-labeling (e.g. "Task (Dynamic)" becoming "Task (Dynamic) (Dynamic / Sport)").
    const profileKey: MotionProfileKey = (s as any).motionProfileKey ?? DEFAULT_MOTION_PROFILE;
    const profileLabel = MOTION_PROFILES[profileKey]?.label ?? 'Standing / Carry';
    const cleanTaskName = s.taskName.replace(/\s*\([^)]*\)\s*$/, '').trim();
    setFont(14, 'bold');
    setColor(27, 58, 107);
    doc.text(`Session ${si + 1}: ${cleanTaskName} (${profileLabel})`, MARGIN, y);
    y += 7;

    // Metadata
    setFont(8);
    setColor(100, 116, 139);
    const metaParts = [
      `ID: ${s.id}`,
      `Date: ${fmtDate(s.date)}`,
      `Duration: ${s.duration}s`,
      `Samples: ${s.snapshots.length}`,
    ];
    if (s.assessor) metaParts.push(`Assessor: ${s.assessor}`);
    if (s.department) metaParts.push(`Dept: ${s.department}`);
    doc.text(metaParts.join('   ·   '), MARGIN, y);
    y += 7;

    // Peak risk badge
    const [rr, rg, rb] = riskRgb(normalizeRisk(s.peakRisk));
    setFill(rr, rg, rb);
    doc.roundedRect(MARGIN, y, 44, 7, 2, 2, 'F');
    setFont(8, 'bold');
    setColor(255, 255, 255);
    doc.text(`Peak Risk: ${riskLabel(normalizeRisk(s.peakRisk))}`, MARGIN + 3, y + 5);

    // Tracking quality badge — retroactively classify if persisted value is missing
    const tqSess = classifyTrackingQuality(s);
    const tqSessLabel = tqSess.charAt(0).toUpperCase() + tqSess.slice(1);
    const tqSessColor: [number, number, number] = tqSess === 'good' ? [34, 197, 94] : tqSess === 'fair' ? [234, 179, 8] : [239, 68, 68];
    setFill(...tqSessColor);
    doc.roundedRect(MARGIN + 48, y, 48, 7, 2, 2, 'F');
    setFont(8, 'bold');
    setColor(255, 255, 255);
    const clampedFrames = s.clampedFrames ?? 0;
    const totalFrames = s.snapshots.length;
    const clampedPct = totalFrames > 0 ? Math.round((clampedFrames / totalFrames) * 100) : 0;
    doc.text(`Tracking: ${tqSessLabel} (${clampedPct}% clamped)`, MARGIN + 51, y + 5);
    y += 14;

    // Score cards — 2×2 grid
    setFont(10, 'bold');
    setColor(15, 23, 42);
    doc.text('Assessment Scores', MARGIN, y);
    y += 6;

    const peakRula = s.peakRula ?? Math.round(s.avgRula);
    const peakReba = s.peakReba ?? Math.round(s.avgReba);
    const sustainedRula = (s as any).sustainedPeakRula ?? peakRula;
    const sustainedReba = (s as any).sustainedPeakReba ?? peakReba;
    const nioshNA = s.avgNiosh === 0 && s.taskProfile?.loadWeight === 0;
    const rsiNA = s.avgRsi === 0 && (s.taskProfile?.repRate ?? 0) < 2;

    const scores = [
      { label: 'RULA', fullName: 'Rapid Upper Limb Assessment', score: peakRula, sustained: sustainedRula, risk: scoreRulaRisk(peakRula), max: 7, na: false },
      { label: 'REBA', fullName: 'Rapid Entire Body Assessment', score: peakReba, sustained: sustainedReba, risk: scoreRebaRisk(peakReba), max: 15, na: false },
      { label: 'NIOSH LI', fullName: 'NIOSH Lifting Index', score: s.avgNiosh, sustained: null, risk: 'low' as RiskLevel, max: 3, na: nioshNA },
      { label: 'RSI', fullName: 'Repetitive Strain Index', score: s.avgRsi, sustained: null, risk: 'low' as RiskLevel, max: 60, na: rsiNA },
    ];

    const cardW = (CONTENT_W - 6) / 2;
    const cardH = 28;
    const col2X = MARGIN + cardW + 6;

    for (let ci = 0; ci < scores.length; ci++) {
      const sc = scores[ci];
      const cx = ci % 2 === 0 ? MARGIN : col2X;
      if (ci % 2 === 0 && ci > 0) y += cardH + 4;
      checkPage(cardH + 4, `Session ${si + 1} of ${sorted.length}`);

      const [sr, sg, sb] = sc.na ? [148, 163, 184] : riskRgb(sc.risk);
      setFill(248, 250, 252);
      setDraw(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'FD');
      setFill(sr, sg, sb);
      doc.roundedRect(cx, y, 3, cardH, 1, 1, 'F');

      setFont(8, 'bold');
      setColor(15, 23, 42);
      doc.text(sc.label, cx + 7, y + 6);
      setFont(6, 'bold');
      setColor(100, 116, 139);
      doc.text('PEAK', cx + 7, y + 10);
      setFont(7);
      setColor(100, 116, 139);
      doc.text(sc.fullName, cx + 7, y + 14);

      if (sc.na) {
        setFont(12, 'bold');
        setColor(148, 163, 184);
        doc.text('N/A', cx + 7, y + 23);
      } else {
        setFont(16, 'bold');
        setColor(sr, sg, sb);
        doc.text(sc.score.toFixed(0), cx + 7, y + 23);
        setFont(7, 'bold');
        setColor(sr, sg, sb);
        doc.text(riskLabel(sc.risk), cx + 20, y + 23);

        if (sc.sustained !== null && sc.sustained !== undefined) {
          const susRisk = sc.label === 'RULA' ? scoreRulaRisk(sc.sustained) : scoreRebaRisk(sc.sustained);
          const [susr, susg, susb] = riskRgb(susRisk);
          setFont(6);
          setColor(100, 116, 139);
          // Use ASCII '>=' to avoid font encoding issues with the Unicode ≥ character
          doc.text('Sustained (>=3 fr.):', cx + 7, y + 27.5);
          setFont(7, 'bold');
          setColor(susr, susg, susb);
          doc.text(String(sc.sustained), cx + 44, y + 27.5);
        }

        const barX = cx + 7;
        const barY = y + cardH - 2;
        const barW = cardW - 14;
        setFill(226, 232, 240);
        doc.roundedRect(barX, barY - 1.5, barW, 1.5, 0.5, 0.5, 'F');
        const pct = Math.min(1, sc.score / sc.max);
        setFill(sr, sg, sb);
        doc.roundedRect(barX, barY - 1.5, barW * pct, 1.5, 0.5, 0.5, 'F');
      }
    }
    y += cardH + 10;

    // Top recommendations (first 3)
    const recs = s.recommendations ?? [];
    if (recs.length > 0) {
      checkPage(20, `Session ${si + 1} of ${sorted.length}`);
      setFont(10, 'bold');
      setColor(15, 23, 42);
      doc.text('Key Recommendations', MARGIN, y);
      y += 6;

      for (let ri = 0; ri < Math.min(recs.length, 3); ri++) {
        const lines = doc.splitTextToSize(recs[ri], CONTENT_W - 12);
        const blockH = lines.length * 4.5 + 5;
        checkPage(blockH + 2, `Session ${si + 1} of ${sorted.length}`);

        setFill(255, 251, 235);
        setDraw(253, 230, 138);
        doc.setLineWidth(0.3);
        doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 2, 2, 'FD');
        setFill(217, 119, 6);
        doc.circle(MARGIN + 5, y + blockH / 2, 3, 'F');
        setFont(6, 'bold');
        setColor(255, 255, 255);
        doc.text(String(ri + 1), MARGIN + 5, y + blockH / 2 + 2, { align: 'center' });
        setFont(7);
        setColor(51, 65, 85);
        doc.text(lines, MARGIN + 12, y + 4.5);
        y += blockH + 3;
      }
      if (recs.length > 3) {
        setFont(7, 'italic');
        setColor(100, 116, 139);
        doc.text(`+ ${recs.length - 3} more recommendations — see individual session report.`, MARGIN, y);
        y += 5;
      }
    }

    // Session notes
    if (s.notes) {
      checkPage(15, `Session ${si + 1} of ${sorted.length}`);
      setFont(8, 'bold');
      setColor(100, 116, 139);
      doc.text('Notes:', MARGIN, y);
      y += 5;
      setFont(7);
      setColor(51, 65, 85);
      const noteLines = doc.splitTextToSize(s.notes, CONTENT_W);
      doc.text(noteLines, MARGIN, y);
      y += noteLines.length * 4.5 + 4;
    }
  }

  // ─── Final page: Trend Summary ────────────────────────────────────────────────
  newPage('Trend Summary');
  y = 14;

  setFont(16, 'bold');
  setColor(27, 58, 107);
  doc.text('Risk Score Trend', MARGIN, y);
  y += 7;

  setFont(8);
  setColor(100, 116, 139);
  doc.text('Peak RULA and REBA scores across all sessions, in chronological order.', MARGIN, y);
  doc.text('Sustained peak scores (>=3 consecutive frames) are shown as dashed lines.', MARGIN, y + 5);
  y += 14;

  // Draw a simple bar + line chart manually in PDF coordinates
  // Chart area
  const CHART_X = MARGIN + 30;
  const CHART_Y = y;
  const CHART_W = CONTENT_W - 40;
  const CHART_H = 60;
  const n = sorted.length;
  const barGroupW = CHART_W / n;
  const barW = Math.min(barGroupW * 0.35, 8);

  // Y-axis labels (0–15 for REBA, 0–7 for RULA — use REBA scale)
  const MAX_Y = 15;
  const yScale = (val: number) => CHART_Y + CHART_H - (val / MAX_Y) * CHART_H;

  // Grid lines
  setDraw(226, 232, 240);
  doc.setLineWidth(0.2);
  for (let v = 0; v <= MAX_Y; v += 3) {
    const gy = yScale(v);
    doc.line(CHART_X, gy, CHART_X + CHART_W, gy);
    setFont(6);
    setColor(148, 163, 184);
    doc.text(String(v), CHART_X - 4, gy + 2, { align: 'right' });
  }

  // Axis
  setDraw(100, 116, 139);
  doc.setLineWidth(0.4);
  doc.line(CHART_X, CHART_Y, CHART_X, CHART_Y + CHART_H);
  doc.line(CHART_X, CHART_Y + CHART_H, CHART_X + CHART_W, CHART_Y + CHART_H);

  // RULA bars (blue) + REBA bars (coral)
  const rulaPoints: [number, number][] = [];
  const rebaPoints: [number, number][] = [];
  const rulaSustPoints: [number, number][] = [];
  const rebaSustPoints: [number, number][] = [];

  sorted.forEach((s, i) => {
    const cx = CHART_X + i * barGroupW + barGroupW / 2;
    const peakRula = s.peakRula ?? Math.round(s.avgRula);
    const peakReba = s.peakReba ?? Math.round(s.avgReba);
    const sustRula = (s as any).sustainedPeakRula ?? peakRula;
    const sustReba = (s as any).sustainedPeakReba ?? peakReba;

    // RULA bar (navy blue)
    const rulaBarX = cx - barW - 1;
    const rulaTop = yScale(peakRula);
    setFill(27, 58, 107);
    doc.rect(rulaBarX, rulaTop, barW, CHART_Y + CHART_H - rulaTop, 'F');

    // REBA bar (coral)
    const rebaBarX = cx + 1;
    const rebaTop = yScale(peakReba);
    setFill(237, 107, 77);
    doc.rect(rebaBarX, rebaTop, barW, CHART_Y + CHART_H - rebaTop, 'F');

    // X-axis label
    setFont(6);
    setColor(100, 116, 139);
    const label = `S${i + 1}`;
    doc.text(label, cx, CHART_Y + CHART_H + 5, { align: 'center' });

    rulaPoints.push([cx - barW / 2 - 0.5, rulaTop]);
    rebaPoints.push([cx + barW / 2 + 0.5, rebaTop]);
    rulaSustPoints.push([cx - barW / 2 - 0.5, yScale(sustRula)]);
    rebaSustPoints.push([cx + barW / 2 + 0.5, yScale(sustReba)]);
  });

  // Draw trend lines (peak — solid)
  if (rulaPoints.length > 1) {
    setDraw(27, 58, 107);
    doc.setLineWidth(0.6);
    for (let i = 1; i < rulaPoints.length; i++) {
      doc.line(rulaPoints[i - 1][0], rulaPoints[i - 1][1], rulaPoints[i][0], rulaPoints[i][1]);
    }
    setDraw(237, 107, 77);
    for (let i = 1; i < rebaPoints.length; i++) {
      doc.line(rebaPoints[i - 1][0], rebaPoints[i - 1][1], rebaPoints[i][0], rebaPoints[i][1]);
    }
  }

  // Draw sustained lines (dashed — approximate with short segments)
  const drawDashed = (points: [number, number][], r: number, g: number, b: number) => {
    if (points.length < 2) return;
    setDraw(r, g, b);
    doc.setLineWidth(0.4);
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i - 1];
      const [x2, y2] = points[i];
      const dx = x2 - x1; const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dashLen = 2; const gapLen = 1.5;
      let traveled = 0;
      let drawing = true;
      while (traveled < dist) {
        const segLen = Math.min(drawing ? dashLen : gapLen, dist - traveled);
        const t1 = traveled / dist;
        const t2 = (traveled + segLen) / dist;
        if (drawing) {
          doc.line(x1 + dx * t1, y1 + dy * t1, x1 + dx * t2, y1 + dy * t2);
        }
        traveled += segLen;
        drawing = !drawing;
      }
    }
  };
  // RULA sustained — navy dashed; REBA sustained — teal dashed (distinct from REBA peak coral)
  drawDashed(rulaSustPoints, 27, 58, 107);
  drawDashed(rebaSustPoints, 20, 184, 166);

  y = CHART_Y + CHART_H + 12;

  // Legend — two rows, each with two entries, so nothing overflows the page width.
  // Row 1: solid colour swatches for peak bars
  setFill(27, 58, 107);
  doc.rect(CHART_X, y, 8, 3, 'F');
  setFont(7);
  setColor(51, 65, 85);
  doc.text('RULA (peak)', CHART_X + 10, y + 3);

  setFill(237, 107, 77);
  doc.rect(CHART_X + 55, y, 8, 3, 'F');
  doc.text('REBA (peak)', CHART_X + 65, y + 3);
  y += 7;

  // Row 2: dashed lines for sustained scores
  setDraw(27, 58, 107);
  doc.setLineWidth(0.4);
  doc.line(CHART_X, y + 1.5, CHART_X + 8, y + 1.5);
  setFont(7);
  setColor(51, 65, 85);
  doc.text('RULA (sustained)', CHART_X + 10, y + 3);

  setDraw(20, 184, 166);
  doc.setLineWidth(0.4);
  doc.line(CHART_X + 55, y + 1.5, CHART_X + 63, y + 1.5);
  doc.text('REBA (sustained)', CHART_X + 65, y + 3);
  y += 10;

  // ─── Side-by-side peak score table ───────────────────────────────────────────
  checkPage(40, 'Trend Summary');
  setFont(11, 'bold');
  setColor(27, 58, 107);
  doc.text('Side-by-Side Peak Score Comparison', MARGIN, y);
  y += 7;

  // Table header
  const tColW = [8, 50, 26, 16, 16, 20, 24, 18];
  const tColX = tColW.reduce<number[]>((acc, w, i) => {
    acc.push(i === 0 ? MARGIN : acc[i - 1] + tColW[i - 1]);
    return acc;
  }, []);
  const tHeaders = ['#', 'Task', 'Date', 'RULA', 'REBA', 'Risk', 'Sust. RULA', 'Sust. REBA'];

  setFill(27, 58, 107);
  doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
  setFont(7, 'bold');
  setColor(255, 255, 255);
  tHeaders.forEach((h, i) => doc.text(h, tColX[i] + 1, y + 5));
  y += 7;

  sorted.forEach((s, idx) => {
    checkPage(8, 'Trend Summary');
    const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
    setFill(...bg);
    doc.rect(MARGIN, y, CONTENT_W, 7, 'F');

    const peakRula = s.peakRula ?? Math.round(s.avgRula);
    const peakReba = s.peakReba ?? Math.round(s.avgReba);
    const sustRula = (s as any).sustainedPeakRula ?? peakRula;
    const sustReba = (s as any).sustainedPeakReba ?? peakReba;
    const [rr, rg, rb] = riskRgb(normalizeRisk(s.peakRisk));
    const taskShort = s.taskName.length > 26 ? s.taskName.slice(0, 24) + '…' : s.taskName;

    setFont(7);
    setColor(51, 65, 85);
    doc.text(String(idx + 1), tColX[0] + 1, y + 5);
    doc.text(taskShort, tColX[1] + 1, y + 5);
    doc.text(fmtDate(s.date), tColX[2] + 1, y + 5);

    setFont(7, 'bold');
    setColor(...riskRgb(scoreRulaRisk(peakRula)));
    doc.text(String(peakRula), tColX[3] + 1, y + 5);
    setColor(...riskRgb(scoreRebaRisk(peakReba)));
    doc.text(String(peakReba), tColX[4] + 1, y + 5);
    setColor(rr, rg, rb);
    doc.text(riskLabel(normalizeRisk(s.peakRisk)), tColX[5] + 1, y + 5);
    setColor(...riskRgb(scoreRulaRisk(sustRula)));
    doc.text(String(sustRula), tColX[6] + 1, y + 5);
    setColor(...riskRgb(scoreRebaRisk(sustReba)));
    doc.text(String(sustReba), tColX[7] + 1, y + 5);

    y += 7;
  });
  y += 8;

  // ─── Legal disclaimer ─────────────────────────────────────────────────────────
  checkPage(14, 'Trend Summary');
  setFont(7);
  setColor(148, 163, 184);
  const disclaimer = 'This comparison report is generated automatically by ErgoKit computer vision analysis. Results should be reviewed by a qualified ergonomist before making intervention decisions. Sustained peak scores represent the highest risk level maintained for >=3 consecutive frames. Tracking quality is computed using task-type-aware anatomical plausibility thresholds.';
  const dLines = doc.splitTextToSize(disclaimer, CONTENT_W);
  doc.text(dLines, MARGIN, y);

  // ─── Save ─────────────────────────────────────────────────────────────────────
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `ergokit-comparison-${sorted.length}sessions-${dateStr}.pdf`;
  doc.save(filename);
}
