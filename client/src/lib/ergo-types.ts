// ============================================================
// ErgoKit — Domain Types & Constants
// ============================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'very-high';

export interface BodyPartRisk {
  region: string;
  score: number;       // 0–10
  level: RiskLevel;
  trend: 'up' | 'down' | 'stable';
}

export interface Assessment {
  id: string;
  title: string;
  worker: string;
  department: string;
  task: string;
  date: string;
  assessor: string;
  rulaScore: number;
  rebaScore: number;
  overallRisk: RiskLevel;
  status: 'draft' | 'in-progress' | 'completed' | 'reviewed';
  bodyParts: BodyPartRisk[];
  actions: CorrectiveAction[];
  notes?: string;
}

export interface CorrectiveAction {
  id: string;
  description: string;
  priority: RiskLevel;
  dueDate: string;
  status: 'open' | 'in-progress' | 'completed';
  owner?: string;
}

export interface RulaInputs {
  // Upper arm
  upperArmAngle: number;       // degrees from vertical
  upperArmAbducted: boolean;
  shoulderRaised: boolean;
  upperArmSupported: boolean;
  // Lower arm
  lowerArmAngle: number;
  lowerArmCrossing: boolean;
  // Wrist
  wristAngle: number;
  wristTwist: 'mid' | 'end';
  // Neck
  neckAngle: number;
  neckTwisted: boolean;
  neckSideBending: boolean;
  // Trunk
  trunkAngle: number;
  trunkTwisted: boolean;
  trunkSideBending: boolean;
  // Legs
  legsSupported: boolean;
  // Muscle use & Force
  muscleUse: 'occasional' | 'static' | 'repeated';
  forceLoad: 'low' | 'medium' | 'high' | 'shock';
}

export interface RebaInputs {
  // Neck
  neckAngle: number;
  neckTwisted: boolean;
  // Trunk
  trunkAngle: number;
  trunkTwisted: boolean;
  trunkSideBending: boolean;
  // Legs
  legPosition: 'bilateral' | 'unilateral' | 'unstable';
  kneeAngle: number;
  // Upper arm
  upperArmAngle: number;
  upperArmAbducted: boolean;
  shoulderRaised: boolean;
  upperArmSupported: boolean;
  // Lower arm
  lowerArmAngle: number;
  // Wrist
  wristAngle: number;
  wristTwisted: boolean;
  // Load / Force
  loadForce: 'low' | 'medium' | 'high' | 'shock';
  // Coupling
  coupling: 'good' | 'fair' | 'poor' | 'unacceptable';
  // Activity
  staticPosture: boolean;
  repeatedSmallRange: boolean;
  rapidLargeRange: boolean;
  unstablePosture: boolean;
}

// ---- RULA Scoring Tables ----

export function calcRulaScore(inputs: RulaInputs): { score: number; actionLevel: number; interpretation: string } {
  // Upper arm score (1–6)
  let upperArm = 1;
  if (inputs.upperArmAngle > 90) upperArm = 4;
  else if (inputs.upperArmAngle > 45) upperArm = 3;
  else if (inputs.upperArmAngle > 20 || inputs.upperArmAngle < -20) upperArm = 2;
  if (inputs.shoulderRaised) upperArm++;
  if (inputs.upperArmAbducted) upperArm++;
  if (inputs.upperArmSupported) upperArm--;
  upperArm = Math.max(1, Math.min(6, upperArm));

  // Lower arm score (1–3)
  let lowerArm = 1;
  if (inputs.lowerArmAngle < 60 || inputs.lowerArmAngle > 100) lowerArm = 2;
  if (inputs.lowerArmCrossing) lowerArm++;
  lowerArm = Math.max(1, Math.min(3, lowerArm));

  // Wrist score (1–4)
  let wrist = 1;
  if (Math.abs(inputs.wristAngle) > 15) wrist = 3;
  else if (inputs.wristAngle !== 0) wrist = 2;
  if (inputs.wristTwist === 'end') wrist++;
  wrist = Math.max(1, Math.min(4, wrist));

  // Table A lookup (simplified)
  const tableA = [
    [1,2,2,2,2,3,3,3],[2,2,2,2,3,3,3,3],[2,3,3,3,3,3,4,4],
    [3,3,3,3,3,4,4,4],[3,4,4,4,4,4,5,5],[4,4,4,4,4,5,5,5],
    [5,5,5,5,5,6,6,7],[5,6,6,6,6,7,7,7]
  ];
  const aIdx = Math.min(upperArm - 1, 5) * 12 + (lowerArm - 1) * 4 + (wrist - 1);
  const scoreA = Math.min(7, Math.max(1, Math.floor(aIdx / 6) + 1));

  // Muscle use & force for A
  let muscleA = 0;
  if (inputs.muscleUse === 'static' || inputs.muscleUse === 'repeated') muscleA++;
  let forceA = 0;
  if (inputs.forceLoad === 'medium') forceA = 1;
  else if (inputs.forceLoad === 'high') forceA = 2;
  else if (inputs.forceLoad === 'shock') forceA = 3;
  const wristArmScore = Math.min(8, scoreA + muscleA + forceA);

  // Neck score (1–4)
  let neck = 1;
  if (inputs.neckAngle > 20) neck = 3;
  else if (inputs.neckAngle > 10) neck = 2;
  if (inputs.neckTwisted || inputs.neckSideBending) neck++;
  neck = Math.max(1, Math.min(4, neck));

  // Trunk score (1–5)
  let trunk = 1;
  if (inputs.trunkAngle > 60) trunk = 4;
  else if (inputs.trunkAngle > 20) trunk = 3;
  else if (inputs.trunkAngle > 0) trunk = 2;
  if (inputs.trunkTwisted || inputs.trunkSideBending) trunk++;
  trunk = Math.max(1, Math.min(5, trunk));

  // Legs score (1–2)
  const legs = inputs.legsSupported ? 1 : 2;

  // Table B lookup (simplified)
  const scoreB = Math.min(7, neck + trunk + legs - 1);
  let muscleB = 0;
  if (inputs.muscleUse === 'static' || inputs.muscleUse === 'repeated') muscleB++;
  const neckTrunkScore = Math.min(8, scoreB + muscleB + forceA);

  // Table C final score
  const tableC: number[][] = [
    [1,2,3,3,4,5,5],
    [2,2,3,4,4,5,5],
    [3,3,3,4,4,5,6],
    [3,3,3,4,5,6,6],
    [4,4,4,5,6,7,7],
    [4,4,5,6,6,7,7],
    [5,5,6,6,7,7,7],
    [5,5,6,7,7,7,7],
  ];
  const rowIdx = Math.min(7, wristArmScore - 1);
  const colIdx = Math.min(6, neckTrunkScore - 1);
  const score = tableC[rowIdx][colIdx];

  let actionLevel = 1;
  let interpretation = 'Acceptable posture. No action required.';
  if (score >= 7) { actionLevel = 4; interpretation = 'Investigate and implement change immediately.'; }
  else if (score >= 5) { actionLevel = 3; interpretation = 'Further investigation and implement change soon.'; }
  else if (score >= 3) { actionLevel = 2; interpretation = 'Further investigation may be needed.'; }

  return { score, actionLevel, interpretation };
}

export function calcRebaScore(inputs: RebaInputs): { score: number; actionLevel: number; riskLevel: string; interpretation: string } {
  // Neck (1–3)
  let neck = 1;
  if (inputs.neckAngle > 20 || inputs.neckAngle < 0) neck = 2;
  if (inputs.neckTwisted) neck++;
  neck = Math.max(1, Math.min(3, neck));

  // Trunk (1–5)
  let trunk = 1;
  if (inputs.trunkAngle > 60) trunk = 4;
  else if (inputs.trunkAngle > 20) trunk = 3;
  else if (inputs.trunkAngle > 0) trunk = 2;
  if (inputs.trunkTwisted || inputs.trunkSideBending) trunk++;
  trunk = Math.max(1, Math.min(5, trunk));

  // Legs (1–4)
  let legs = inputs.legPosition === 'bilateral' ? 1 : 2;
  if (inputs.kneeAngle > 60) legs += 2;
  else if (inputs.kneeAngle > 30) legs++;
  legs = Math.max(1, Math.min(4, legs));

  // Table A
  const scoreA = Math.min(12, neck + trunk + legs);

  // Load/force modifier
  let loadMod = 0;
  if (inputs.loadForce === 'medium') loadMod = 1;
  else if (inputs.loadForce === 'high') loadMod = 2;
  else if (inputs.loadForce === 'shock') loadMod = 3;
  const scoreAFinal = Math.min(12, scoreA + loadMod);

  // Upper arm (1–6)
  let upperArm = 1;
  if (inputs.upperArmAngle > 90) upperArm = 4;
  else if (inputs.upperArmAngle > 45) upperArm = 3;
  else if (inputs.upperArmAngle > 20) upperArm = 2;
  if (inputs.upperArmAbducted || inputs.shoulderRaised) upperArm++;
  if (inputs.upperArmSupported) upperArm--;
  upperArm = Math.max(1, Math.min(6, upperArm));

  // Lower arm (1–2)
  const lowerArm = (inputs.lowerArmAngle >= 60 && inputs.lowerArmAngle <= 100) ? 1 : 2;

  // Wrist (1–3)
  let wrist = 1;
  if (Math.abs(inputs.wristAngle) > 15) wrist = 3;
  else if (inputs.wristAngle !== 0) wrist = 2;
  if (inputs.wristTwisted) wrist++;
  wrist = Math.max(1, Math.min(3, wrist));

  // Table B
  const scoreB = Math.min(9, upperArm + lowerArm + wrist);

  // Coupling modifier
  let couplingMod = 0;
  if (inputs.coupling === 'fair') couplingMod = 1;
  else if (inputs.coupling === 'poor') couplingMod = 2;
  else if (inputs.coupling === 'unacceptable') couplingMod = 3;
  const scoreBFinal = Math.min(9, scoreB + couplingMod);

  // Table C
  const tableC: number[][] = [
    [1,1,1,2,3,3,4,5,6,7,7,7],
    [1,2,2,3,4,4,5,6,6,7,7,8],
    [2,3,3,3,4,5,6,7,7,8,8,8],
    [3,4,4,4,5,6,7,8,8,9,9,9],
    [4,4,4,5,6,7,8,8,9,9,9,9],
    [6,6,6,7,8,8,9,9,10,10,10,10],
    [7,7,7,8,9,9,9,10,10,11,11,11],
    [8,8,8,9,10,10,10,10,10,11,11,11],
    [9,9,9,10,10,10,11,11,11,12,12,12],
  ];
  const rowIdx = Math.min(8, scoreAFinal - 1);
  const colIdx = Math.min(11, scoreBFinal - 1);
  const baseScore = tableC[rowIdx][colIdx];

  // Activity score
  let activityMod = 0;
  if (inputs.staticPosture) activityMod++;
  if (inputs.repeatedSmallRange) activityMod++;
  if (inputs.rapidLargeRange || inputs.unstablePosture) activityMod++;
  const score = Math.min(15, baseScore + activityMod);

  let actionLevel = 1;
  let riskLevel = 'Negligible';
  let interpretation = 'No action required.';
  if (score >= 11) { actionLevel = 4; riskLevel = 'Very High'; interpretation = 'Implement change immediately.'; }
  else if (score >= 8) { actionLevel = 3; riskLevel = 'High'; interpretation = 'Investigate and implement change soon.'; }
  else if (score >= 4) { actionLevel = 2; riskLevel = 'Medium'; interpretation = 'Further investigation needed.'; }
  else if (score >= 2) { actionLevel = 1; riskLevel = 'Low'; interpretation = 'Change may be needed.'; }

  return { score, actionLevel, riskLevel, interpretation };
}

export function getRiskLevel(score: number): RiskLevel {
  if (score <= 3) return 'low';
  if (score <= 6) return 'medium';
  if (score <= 8) return 'high';
  return 'very-high';
}

export function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low': return '#16A34A';
    case 'medium': return '#D97706';
    case 'high': return '#DC2626';
    case 'very-high': return '#991B1B';
  }
}

export function getRiskLabel(level: RiskLevel): string {
  switch (level) {
    case 'low': return 'Low Risk';
    case 'medium': return 'Medium Risk';
    case 'high': return 'High Risk';
    case 'very-high': return 'Very High Risk';
  }
}

// ---- Sample Data ----

export const SAMPLE_ASSESSMENTS: Assessment[] = [
  {
    id: 'EA-2024-001',
    title: 'Assembly Station 3 — Component Insertion',
    worker: 'J. Martinez',
    department: 'Production Line A',
    task: 'Overhead component insertion',
    date: '2024-05-13',
    assessor: 'Sarah Chen, CPE',
    rulaScore: 7,
    rebaScore: 9,
    overallRisk: 'high',
    status: 'completed',
    bodyParts: [
      { region: 'Neck', score: 6, level: 'medium', trend: 'stable' },
      { region: 'Shoulders', score: 7, level: 'high', trend: 'up' },
      { region: 'Upper Back', score: 8, level: 'high', trend: 'up' },
      { region: 'Lower Back', score: 7, level: 'medium', trend: 'stable' },
      { region: 'Elbows', score: 5, level: 'medium', trend: 'down' },
      { region: 'Wrists/Hands', score: 8, level: 'high', trend: 'up' },
      { region: 'Hips/Thighs', score: 4, level: 'medium', trend: 'stable' },
      { region: 'Knees', score: 3, level: 'low', trend: 'stable' },
      { region: 'Ankles/Feet', score: 2, level: 'low', trend: 'down' },
    ],
    actions: [
      { id: 'CA-001', description: 'Adjust workstation height to maintain neutral shoulder posture', priority: 'high', dueDate: '2024-06-01', status: 'in-progress', owner: 'Facilities' },
      { id: 'CA-002', description: 'Introduce sit-stand option for shift rotation', priority: 'medium', dueDate: '2024-06-15', status: 'open', owner: 'Operations' },
      { id: 'CA-003', description: 'Provide forearm support to reduce upper limb static loading', priority: 'high', dueDate: '2024-06-01', status: 'open', owner: 'Facilities' },
      { id: 'CA-004', description: 'Implement micro-breaks and stretching program', priority: 'medium', dueDate: '2024-06-30', status: 'open', owner: 'HR/Safety' },
    ],
    notes: 'Worker reports shoulder discomfort after 2 hours. Task involves sustained overhead reach at 150° shoulder flexion.',
  },
  {
    id: 'EA-2024-002',
    title: 'Packaging Line 2 — Box Sealing',
    worker: 'R. Thompson',
    department: 'Packaging',
    task: 'Repetitive box sealing',
    date: '2024-05-10',
    assessor: 'Sarah Chen, CPE',
    rulaScore: 5,
    rebaScore: 6,
    overallRisk: 'medium',
    status: 'reviewed',
    bodyParts: [
      { region: 'Neck', score: 4, level: 'medium', trend: 'stable' },
      { region: 'Shoulders', score: 5, level: 'medium', trend: 'stable' },
      { region: 'Upper Back', score: 4, level: 'medium', trend: 'down' },
      { region: 'Lower Back', score: 6, level: 'medium', trend: 'stable' },
      { region: 'Elbows', score: 3, level: 'low', trend: 'stable' },
      { region: 'Wrists/Hands', score: 6, level: 'medium', trend: 'up' },
      { region: 'Hips/Thighs', score: 2, level: 'low', trend: 'stable' },
      { region: 'Knees', score: 2, level: 'low', trend: 'stable' },
      { region: 'Ankles/Feet', score: 1, level: 'low', trend: 'stable' },
    ],
    actions: [
      { id: 'CA-005', description: 'Rotate task every 45 minutes to reduce repetitive wrist strain', priority: 'medium', dueDate: '2024-06-10', status: 'completed', owner: 'Operations' },
      { id: 'CA-006', description: 'Evaluate anti-fatigue matting for standing workstation', priority: 'low', dueDate: '2024-07-01', status: 'open', owner: 'Facilities' },
    ],
  },
  {
    id: 'EA-2024-003',
    title: 'Warehouse — Manual Pallet Loading',
    worker: 'D. Okafor',
    department: 'Warehouse',
    task: 'Manual pallet stacking',
    date: '2024-05-08',
    assessor: 'Mike Rivera, CPE',
    rulaScore: 4,
    rebaScore: 8,
    overallRisk: 'high',
    status: 'in-progress',
    bodyParts: [
      { region: 'Neck', score: 3, level: 'low', trend: 'stable' },
      { region: 'Shoulders', score: 4, level: 'medium', trend: 'stable' },
      { region: 'Upper Back', score: 5, level: 'medium', trend: 'stable' },
      { region: 'Lower Back', score: 9, level: 'high', trend: 'up' },
      { region: 'Elbows', score: 3, level: 'low', trend: 'stable' },
      { region: 'Wrists/Hands', score: 4, level: 'medium', trend: 'stable' },
      { region: 'Hips/Thighs', score: 6, level: 'medium', trend: 'up' },
      { region: 'Knees', score: 5, level: 'medium', trend: 'stable' },
      { region: 'Ankles/Feet', score: 3, level: 'low', trend: 'stable' },
    ],
    actions: [
      { id: 'CA-007', description: 'Introduce mechanical lift assist for loads > 15 kg', priority: 'high', dueDate: '2024-06-01', status: 'in-progress', owner: 'Facilities' },
      { id: 'CA-008', description: 'Redesign pallet height to eliminate floor-level lifts', priority: 'high', dueDate: '2024-06-15', status: 'open', owner: 'Engineering' },
    ],
  },
  {
    id: 'EA-2024-004',
    title: 'QC Inspection — Visual Checking Station',
    worker: 'L. Park',
    department: 'Quality Control',
    task: 'Seated visual inspection',
    date: '2024-05-06',
    assessor: 'Mike Rivera, CPE',
    rulaScore: 3,
    rebaScore: 3,
    overallRisk: 'low',
    status: 'completed',
    bodyParts: [
      { region: 'Neck', score: 4, level: 'medium', trend: 'down' },
      { region: 'Shoulders', score: 2, level: 'low', trend: 'stable' },
      { region: 'Upper Back', score: 2, level: 'low', trend: 'stable' },
      { region: 'Lower Back', score: 3, level: 'low', trend: 'stable' },
      { region: 'Elbows', score: 2, level: 'low', trend: 'stable' },
      { region: 'Wrists/Hands', score: 3, level: 'low', trend: 'stable' },
      { region: 'Hips/Thighs', score: 2, level: 'low', trend: 'stable' },
      { region: 'Knees', score: 1, level: 'low', trend: 'stable' },
      { region: 'Ankles/Feet', score: 1, level: 'low', trend: 'stable' },
    ],
    actions: [
      { id: 'CA-009', description: 'Adjust monitor height to reduce neck flexion', priority: 'low', dueDate: '2024-06-30', status: 'completed', owner: 'IT/Facilities' },
    ],
  },
  {
    id: 'EA-2024-005',
    title: 'Welding Bay 1 — Overhead Welding',
    worker: 'T. Nguyen',
    department: 'Fabrication',
    task: 'Overhead structural welding',
    date: '2024-05-03',
    assessor: 'Sarah Chen, CPE',
    rulaScore: 7,
    rebaScore: 11,
    overallRisk: 'very-high',
    status: 'completed',
    bodyParts: [
      { region: 'Neck', score: 9, level: 'very-high', trend: 'up' },
      { region: 'Shoulders', score: 10, level: 'very-high', trend: 'up' },
      { region: 'Upper Back', score: 8, level: 'high', trend: 'up' },
      { region: 'Lower Back', score: 7, level: 'high', trend: 'stable' },
      { region: 'Elbows', score: 6, level: 'medium', trend: 'stable' },
      { region: 'Wrists/Hands', score: 7, level: 'high', trend: 'up' },
      { region: 'Hips/Thighs', score: 4, level: 'medium', trend: 'stable' },
      { region: 'Knees', score: 3, level: 'low', trend: 'stable' },
      { region: 'Ankles/Feet', score: 2, level: 'low', trend: 'stable' },
    ],
    actions: [
      { id: 'CA-010', description: 'Implement elevated work platform to eliminate overhead posture', priority: 'very-high', dueDate: '2024-05-20', status: 'in-progress', owner: 'Engineering' },
      { id: 'CA-011', description: 'Rotate welders every 30 minutes for overhead tasks', priority: 'high', dueDate: '2024-05-15', status: 'completed', owner: 'Operations' },
      { id: 'CA-012', description: 'Evaluate robotic welding arm for overhead sections', priority: 'medium', dueDate: '2024-07-01', status: 'open', owner: 'Engineering' },
    ],
    notes: 'Immediate intervention required. Worker reports neck pain and numbness in both hands.',
  },
];

export const RISK_TREND_DATA = [
  { month: 'Nov 23', overall: 8.5, high: 4, medium: 6, low: 2 },
  { month: 'Dec 23', overall: 8.0, high: 4, medium: 5, low: 3 },
  { month: 'Jan 24', overall: 7.5, high: 3, medium: 6, low: 3 },
  { month: 'Feb 24', overall: 7.0, high: 3, medium: 5, low: 4 },
  { month: 'Mar 24', overall: 6.5, high: 2, medium: 6, low: 4 },
  { month: 'Apr 24', overall: 6.0, high: 2, medium: 5, low: 5 },
  { month: 'May 24', overall: 5.0, high: 2, medium: 4, low: 6 },
];
