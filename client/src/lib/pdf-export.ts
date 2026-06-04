/**
 * pdf-export.ts — ErgoKit
 * =======================
 * Generates a professional multi-page PDF report from a SessionRecord.
 * Uses jsPDF for PDF generation (no html2canvas — pure programmatic PDF).
 *
 * Layout:
 *   Page 1: Cover / summary — session metadata, risk badge, score cards
 *   Page 2: Body Region Risk Map (bar chart), Average Joint Angles
 *   Page 3: Recommendations + Corrective Actions
 *   Page N: Thumbnail (if available)
 */
import type { SessionRecord, BodyAngles, RiskLevel } from './ergo-engine';

// ─── Color helpers ─────────────────────────────────────────────────────────────
function riskRgb(level: RiskLevel): [number, number, number] {
  switch (level) {
    case 'very-high': return [239, 68, 68];   // red-500
    case 'high':      return [249, 115, 22];  // orange-500
    case 'medium':    return [234, 179, 8];   // yellow-500
    case 'low':       return [34, 197, 94];   // green-500
    default:          return [100, 116, 139]; // slate-500
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
function scoreNioshRisk(s: number): RiskLevel {
  return s >= 2 ? 'high' : s >= 1 ? 'medium' : 'low';
}
function scoreRsiRisk(s: number): RiskLevel {
  return s >= 40 ? 'high' : s >= 20 ? 'medium' : 'low';
}
function normalizeRisk(level: string): RiskLevel {
  if (level === 'negligible') return 'low';
  if (level === 'very-high') return 'very-high';
  if (level === 'high') return 'high';
  if (level === 'medium') return 'medium';
  return 'low';
}

// ─── PDF builder ───────────────────────────────────────────────────────────────
export async function exportSessionPdf(session: SessionRecord): Promise<void> {
  // Dynamic import to avoid loading jspdf at startup
  const { jsPDF } = await import('jspdf');

  const PAGE_W = 210; // A4 mm
  const PAGE_H = 297;
  const MARGIN = 16;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ─── Fonts / helpers ──────────────────────────────────────────────────────────
  const setFont = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal') => {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
  };
  const setColor = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);
  const setFill  = (r: number, g: number, b: number) => doc.setFillColor(r, g, b);
  const setDraw  = (r: number, g: number, b: number) => doc.setDrawColor(r, g, b);

  let y = MARGIN;

  // ─── Page management ──────────────────────────────────────────────────────────
  const checkPage = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
      drawHeader();
    }
  };

  const drawHeader = () => {
    // Thin sky-blue top bar
    setFill(6, 182, 212);
    doc.rect(0, 0, PAGE_W, 6, 'F');
    // Footer
    setFont(7);
    setColor(148, 163, 184);
    doc.text(`ErgoKit CV Ergonomics · ${session.id} · ${session.date}`, MARGIN, PAGE_H - 5);
    doc.text(`Page ${doc.getNumberOfPages()}`, PAGE_W - MARGIN, PAGE_H - 5, { align: 'right' });
    setColor(15, 23, 42); // reset to dark
  };

  // ─── PAGE 1: Cover ────────────────────────────────────────────────────────────
  drawHeader();
  y = 14;

  // Logo / brand
  setFont(9, 'bold');
  setColor(6, 182, 212);
  doc.text('ErgoKit', MARGIN, y);
  setFont(9);
  setColor(100, 116, 139);
  doc.text('Industrial Ergonomics Assessment', MARGIN + 22, y);
  y += 10;

  // Title
  setFont(18, 'bold');
  setColor(15, 23, 42);
  doc.text(session.taskName || 'Ergonomics Assessment', MARGIN, y);
  y += 7;

  // Metadata row
  setFont(9);
  setColor(100, 116, 139);
  const meta: string[] = [
    `Session: ${session.id}`,
    `Date: ${session.date}`,
    `Duration: ${session.duration}s`,
    `Samples: ${session.snapshots.length}`,
  ];
  if (session.assessor) meta.push(`Assessor: ${session.assessor}`);
  if (session.department) meta.push(`Dept: ${session.department}`);
  if (session.location) meta.push(`Location: ${session.location}`);
  doc.text(meta.join('   ·   '), MARGIN, y);
  y += 8;

  // Risk badge
  const [rr, rg, rb] = riskRgb(normalizeRisk(session.peakRisk));
  setFill(rr, rg, rb);
  doc.roundedRect(MARGIN, y, 48, 8, 2, 2, 'F');
  setFont(9, 'bold');
  setColor(255, 255, 255);
  doc.text(`Peak Risk: ${riskLabel(session.peakRisk)}`, MARGIN + 4, y + 5.5);
  y += 14;

  // Divider
  setDraw(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  // ─── Summary text ─────────────────────────────────────────────────────────────
  const peakRiskNorm = normalizeRisk(session.peakRisk);
  const isHighRisk = peakRiskNorm === 'high' || peakRiskNorm === 'very-high';
  const isMedRisk  = peakRiskNorm === 'medium';
  const summaryText = isHighRisk
    ? 'This assessment found serious ergonomic risks requiring immediate attention. The worker\'s posture during this task presents significant risk of musculoskeletal injury. Immediate corrective action is recommended.'
    : isMedRisk
    ? 'This assessment found moderate ergonomic risks. Continued exposure without changes will likely lead to discomfort or injury over time. The recommendations below outline practical steps to reduce this risk.'
    : 'This assessment found low ergonomic risk. The worker\'s posture during this task is generally acceptable. Minor improvements may still be beneficial for long-term comfort.';

  setFont(9);
  setColor(51, 65, 85);
  const summaryLines = doc.splitTextToSize(summaryText, CONTENT_W);
  doc.text(summaryLines, MARGIN, y);
  y += summaryLines.length * 5 + 8;

  // ─── Score cards (2×2 grid) ───────────────────────────────────────────────────
  setFont(11, 'bold');
  setColor(15, 23, 42);
  doc.text('Assessment Scores', MARGIN, y);
  y += 7;

  const scores = [
    { label: 'RULA', fullName: 'Rapid Upper Limb Assessment', score: session.avgRula, risk: scoreRulaRisk(session.avgRula) as RiskLevel, max: 7 },
    { label: 'REBA', fullName: 'Rapid Entire Body Assessment', score: session.avgReba, risk: scoreRebaRisk(session.avgReba) as RiskLevel, max: 15 },
    { label: 'NIOSH LI', fullName: 'NIOSH Lifting Index', score: session.avgNiosh, risk: scoreNioshRisk(session.avgNiosh) as RiskLevel, max: 3 },
    { label: 'RSI', fullName: 'Repetitive Strain Index', score: session.avgRsi, risk: scoreRsiRisk(session.avgRsi) as RiskLevel, max: 60 },
  ];

  const cardW = (CONTENT_W - 6) / 2;
  const cardH = 28;
  const col2X = MARGIN + cardW + 6;

  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    const cx = i % 2 === 0 ? MARGIN : col2X;
    if (i % 2 === 0 && i > 0) y += cardH + 4;
    checkPage(cardH + 4);

    const [sr, sg, sb] = riskRgb(s.risk);

    // Card background
    setFill(248, 250, 252);
    setDraw(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'FD');

    // Left accent bar
    setFill(sr, sg, sb);
    doc.roundedRect(cx, y, 3, cardH, 1, 1, 'F');

    // Score label
    setFont(8, 'bold');
    setColor(15, 23, 42);
    doc.text(s.label, cx + 7, y + 6);

    // Full name
    setFont(7);
    setColor(100, 116, 139);
    doc.text(s.fullName, cx + 7, y + 11);

    // Score number
    setFont(18, 'bold');
    setColor(sr, sg, sb);
    doc.text(s.score.toFixed(1), cx + 7, y + 23);

    // Risk label
    setFont(8, 'bold');
    setColor(sr, sg, sb);
    doc.text(riskLabel(s.risk), cx + 28, y + 23);

    // Progress bar background
    const barX = cx + 7;
    const barY = y + 25.5;
    const barW = cardW - 14;
    setFill(226, 232, 240);
    doc.roundedRect(barX, barY, barW, 1.5, 0.5, 0.5, 'F');
    // Progress bar fill
    const pct = Math.min(1, s.score / s.max);
    setFill(sr, sg, sb);
    doc.roundedRect(barX, barY, barW * pct, 1.5, 0.5, 0.5, 'F');
  }
  y += cardH + 10;

  // ─── PAGE 2: Body Region Risk Map + Joint Angles ──────────────────────────────
  checkPage(60);

  setFont(11, 'bold');
  setColor(15, 23, 42);
  doc.text('Body Region Risk Map', MARGIN, y);
  y += 7;

  const bodyRegions = session.bodyRegions ?? [];
  if (bodyRegions.length > 0) {
    const barMaxW = CONTENT_W - 60;
    const rowH = 8;
    for (const region of bodyRegions) {
      checkPage(rowH + 2);
      const [br, bg, bb] = riskRgb(normalizeRisk(region.riskLevel));
      const pct = Math.min(1, region.score / 10);

      // Label
      setFont(8);
      setColor(51, 65, 85);
      doc.text(region.region, MARGIN, y + 5);

      // Bar background
      setFill(241, 245, 249);
      doc.roundedRect(MARGIN + 55, y + 1, barMaxW, 5, 1, 1, 'F');
      // Bar fill
      setFill(br, bg, bb);
      doc.roundedRect(MARGIN + 55, y + 1, barMaxW * pct, 5, 1, 1, 'F');

      // Score
      setFont(8, 'bold');
      setColor(br, bg, bb);
      doc.text(region.score.toFixed(1), MARGIN + 55 + barMaxW + 3, y + 5.5);

      y += rowH;
    }
    y += 6;
  } else {
    setFont(8);
    setColor(148, 163, 184);
    doc.text('No body region data available.', MARGIN, y);
    y += 10;
  }

  // ─── Average Joint Angles ─────────────────────────────────────────────────────
  checkPage(30);

  setFont(11, 'bold');
  setColor(15, 23, 42);
  doc.text('Average Joint Angles', MARGIN, y);
  y += 7;

  const ANGLE_SAFE_RANGES: Record<string, { safe: [number, number]; label: string }> = {
    neckFlexion:   { safe: [-20, 20],  label: 'Neck Flexion' },
    trunkFlexion:  { safe: [-20, 20],  label: 'Trunk Flexion' },
    leftUpperArm:  { safe: [0, 20],    label: 'L. Shoulder Elevation' },
    rightUpperArm: { safe: [0, 20],    label: 'R. Shoulder Elevation' },
    leftWrist:     { safe: [-15, 15],  label: 'L. Wrist Deviation' },
    rightWrist:    { safe: [-15, 15],  label: 'R. Wrist Deviation' },
    hipFlexion:    { safe: [-30, 30],  label: 'Hip Flexion' },
    leftKnee:      { safe: [0, 30],    label: 'L. Knee Bend' },
    rightKnee:     { safe: [0, 30],    label: 'R. Knee Bend' },
  };

  const avgAngles = session.avgAngles as Partial<BodyAngles> | undefined;
  if (avgAngles && Object.keys(avgAngles).length > 0) {
    for (const [key, value] of Object.entries(avgAngles)) {
      const info = ANGLE_SAFE_RANGES[key];
      if (!info || typeof value !== 'number') continue;
      checkPage(8);

      const [lo, hi] = info.safe;
      const margin = (hi - lo) * 0.5;
      const inSafe = value >= lo && value <= hi;
      const inCaution = !inSafe && value >= lo - margin && value <= hi + margin;
      const risk: RiskLevel = inSafe ? 'low' : inCaution ? 'medium' : 'high'; // always valid
      const [ar, ag, ab] = riskRgb(risk);

      setFont(8);
      setColor(51, 65, 85);
      doc.text(info.label, MARGIN, y + 5);

      // Bar
      const barMaxW2 = CONTENT_W - 70;
      const maxRange = Math.max(Math.abs(lo), Math.abs(hi)) * 2.5;
      const pct2 = Math.min(1, Math.abs(value) / maxRange);
      setFill(241, 245, 249);
      doc.roundedRect(MARGIN + 60, y + 1, barMaxW2, 5, 1, 1, 'F');
      setFill(ar, ag, ab);
      doc.roundedRect(MARGIN + 60, y + 1, barMaxW2 * pct2, 5, 1, 1, 'F');

      // Value
      setFont(8, 'bold');
      setColor(ar, ag, ab);
      doc.text(`${value.toFixed(1)}°`, MARGIN + 60 + barMaxW2 + 3, y + 5.5);

      // Safe range annotation
      setFont(6);
      setColor(148, 163, 184);
      doc.text(`Safe: ${lo}° to ${hi}°`, MARGIN + 60, y + 9);

      y += 11;
    }
    y += 4;
  } else {
    setFont(8);
    setColor(148, 163, 184);
    doc.text('No joint angle data available.', MARGIN, y);
    y += 10;
  }

  // ─── PAGE 3: Recommendations + Actions ───────────────────────────────────────
  checkPage(30);

  setFont(11, 'bold');
  setColor(15, 23, 42);
  doc.text('Recommendations', MARGIN, y);
  y += 7;

  const recommendations = session.recommendations ?? [];
  if (recommendations.length > 0) {
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      const lines = doc.splitTextToSize(rec, CONTENT_W - 12);
      const blockH = lines.length * 5 + 6;
      checkPage(blockH + 2);

      // Background
      setFill(255, 251, 235);
      setDraw(253, 230, 138);
      doc.setLineWidth(0.3);
      doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 2, 2, 'FD');

      // Number badge
      setFill(217, 119, 6);
      doc.circle(MARGIN + 5, y + blockH / 2, 3.5, 'F');
      setFont(7, 'bold');
      setColor(255, 255, 255);
      doc.text(String(i + 1), MARGIN + 5, y + blockH / 2 + 2.5, { align: 'center' });

      // Text
      setFont(8);
      setColor(51, 65, 85);
      doc.text(lines, MARGIN + 12, y + 5.5);

      y += blockH + 3;
    }
    y += 4;
  } else {
    setFont(8);
    setColor(148, 163, 184);
    doc.text('No recommendations generated.', MARGIN, y);
    y += 10;
  }

  // ─── Corrective Actions ───────────────────────────────────────────────────────
  const actions = session.actions ?? [];
  if (actions.length > 0) {
    checkPage(20);
    setFont(11, 'bold');
    setColor(15, 23, 42);
    doc.text('Corrective Actions', MARGIN, y);
    y += 7;

    for (const action of actions) {
      const lines = doc.splitTextToSize(action.description, CONTENT_W - 50);
      const blockH = Math.max(12, lines.length * 5 + 6);
      checkPage(blockH + 2);

      setFill(248, 250, 252);
      setDraw(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(MARGIN, y, CONTENT_W, blockH, 2, 2, 'FD');

      // Priority badge
      const priorityColors: Record<string, [number, number, number]> = {
        critical: [239, 68, 68], high: [249, 115, 22], medium: [234, 179, 8], low: [100, 116, 139],
      };
      const [pr, pg, pb] = priorityColors[action.priority] ?? [100, 116, 139];
      setFill(pr, pg, pb);
      doc.roundedRect(MARGIN + 3, y + 3, 18, 5, 1, 1, 'F');
      setFont(6, 'bold');
      setColor(255, 255, 255);
      doc.text(action.priority.toUpperCase(), MARGIN + 12, y + 6.5, { align: 'center' });

      // Status
      const statusColors: Record<string, [number, number, number]> = {
        open: [100, 116, 139], 'in-progress': [59, 130, 246], completed: [34, 197, 94], verified: [16, 185, 129],
      };
      const [str, stg, stb] = statusColors[action.status] ?? [100, 116, 139];
      setFont(6);
      setColor(str, stg, stb);
      doc.text(action.status.replace('-', ' ').toUpperCase(), MARGIN + 25, y + 6.5);

      // Description
      setFont(8);
      setColor(51, 65, 85);
      doc.text(lines, MARGIN + 48, y + 5.5);

      y += blockH + 3;
    }
    y += 4;
  }

  // ─── Thumbnail page (if available) ───────────────────────────────────────────
  const thumbUrl = (session as any).thumbnailDataUrl as string | undefined;
  if (thumbUrl) {
    doc.addPage();
    drawHeader();
    y = 14;

    setFont(11, 'bold');
    setColor(15, 23, 42);
    doc.text('Session Thumbnail', MARGIN, y);
    y += 6;

    try {
      // Fit image to page width
      const imgW = CONTENT_W;
      const imgH = imgW * (9 / 16); // assume 16:9
      doc.addImage(thumbUrl, 'JPEG', MARGIN, y, imgW, imgH);
      y += imgH + 4;
    } catch {
      setFont(8);
      setColor(148, 163, 184);
      doc.text('Thumbnail could not be embedded.', MARGIN, y);
    }
  }

  // ─── Notes ────────────────────────────────────────────────────────────────────
  if (session.notes) {
    checkPage(20);
    setFont(11, 'bold');
    setColor(15, 23, 42);
    doc.text('Assessor Notes', MARGIN, y);
    y += 7;
    setFont(8);
    setColor(51, 65, 85);
    const noteLines = doc.splitTextToSize(session.notes, CONTENT_W);
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 5 + 4;
  }

  // ─── Legal footer on last page ────────────────────────────────────────────────
  checkPage(12);
  setFont(7);
  setColor(148, 163, 184);
  const disclaimer = 'This report is generated automatically by computer vision analysis. Results should be reviewed by a qualified ergonomist for critical decisions.';
  const disclaimerLines = doc.splitTextToSize(disclaimer, CONTENT_W);
  doc.text(disclaimerLines, MARGIN, y);

  // ─── Save ─────────────────────────────────────────────────────────────────────
  const filename = `ergokit-${session.id}-${session.taskName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
  doc.save(filename);
}
