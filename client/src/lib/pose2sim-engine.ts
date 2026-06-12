/**
 * pose2sim-engine.ts — validated RULA/REBA engine ported VERBATIM from
 * ErgoKit_latest.html (the standalone tool validated against published worked
 * examples and Kinovea ground truth). The math here is intentionally unchanged
 * from the source; do not "clean it up" — equivalence to the validated engine
 * is proven by client/src/lib/__tests__/pose2sim-engine.parity.test.ts.
 *
 * Source conventions: Pose2Sim/common.py points_to_angles(), fixed_angles(),
 * angle_dict; BLAZEPOSE skeleton mapping from Pose2Sim/skeletons.py.
 *
 * Coordinate input: pass MediaPipe worldLandmarks with isWorld=true (the
 * validated path). Image landmarks with isWorld=false are a degraded fallback.
 */

export type Vec3 = [number, number, number];
export interface P2SLandmark { x: number; y: number; z: number; visibility?: number }

// ── vector helpers (verbatim) ──
function v3(a: Vec3, b: Vec3): Vec3 { return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; }
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function mg(v: Vec3): number { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
function mp(a: Vec3, b: Vec3): Vec3 { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }
function cross3(u: Vec3, v: Vec3): Vec3 {
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

// ── Pose2Sim-ported angle math (verbatim) ──
function p2s3(a: Vec3, b: Vec3, c: Vec3): number {
  const u = v3(b, a), v_ = v3(b, c);
  return Math.atan2(mg(cross3(u, v_)), dot(u, v_)) * 180 / Math.PI;
}
function p2s4(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const u = v3(a, b), v_ = v3(c, d);
  return Math.atan2(mg(cross3(u, v_)), dot(u, v_)) * 180 / Math.PI;
}
function p2sFix(raw: number, offset: number, mult: number): number {
  let a = ((raw + offset) * mult + 180) % 360 - 180;
  return a < -180 ? a + 360 : a;
}

export interface P2STaskInputs { load: number; freq: number; grip: number }

export interface P2SAngles {
  tf: number; ts: number; trunkRot: number; nf: number; ns: number;
  ua: number; la: number; wr: number; kneeFlex: number;
  bilateral: boolean; shoulderRaised: boolean; armAbducted: boolean;
  laCross: boolean; wrBent: boolean;
  joints: {
    rElbow: number; lElbow: number; rShoulder: number; lShoulder: number;
    rWrist: number; lWrist: number; rKnee: number; lKnee: number;
  };
  isWorld: boolean;
}

export interface P2SRulaResult {
  ua: number; la: number; wr: number; nk: number; tr: number; lg: number;
  wristArmScore: number; neckTrunkLegScore: number;
  poseScoreA: number; poseScoreB: number; fs: number;
}
export interface P2SRebaResult {
  nk: number; tr: number; lg: number; ua: number; la: number; wr: number;
  scoreA: number; scoreB: number; postureScoreA: number; postureScoreB: number; fs: number;
}

/** Verbatim port of calcAngles(l, isWorld). */
export function calcAngles(l: P2SLandmark[], isWorld: boolean): P2SAngles {
  const p = (i: number): Vec3 => [l[i].x, l[i].y, l[i].z];

  const RShoulder = p(12), LShoulder = p(11);
  const RElbow = p(14), LElbow = p(13);
  const RWrist = p(16), LWrist = p(15);
  const RHip = p(24), LHip = p(23);
  const RKnee = p(26), LKnee = p(25);
  const RAnkle = p(28), LAnkle = p(27);
  const RIndex = p(20), LIndex = p(19);
  const LEar = p(7), REar = p(8);

  const Hip = mp(LHip, RHip);
  const Neck = mp(LShoulder, RShoulder);
  const Head = mp(LEar, REar);

  const rElbow = p2sFix(p2s3(RWrist, RElbow, RShoulder), 180, -1);
  const lElbow = p2sFix(p2s3(LWrist, LElbow, LShoulder), 180, -1);
  const la = (Math.abs(rElbow) + Math.abs(lElbow)) / 2;

  const rShoulder = p2sFix(p2s4(RElbow, RShoulder, Hip, Neck), 0, -1);
  const lShoulder = p2sFix(p2s4(LElbow, LShoulder, Hip, Neck), 0, -1);
  const ua = Math.max(Math.abs(rShoulder), Math.abs(lShoulder));

  const rWrist = p2sFix(p2s3(RElbow, RWrist, RIndex), -180, 1);
  const lWrist = p2sFix(p2s3(LElbow, LIndex, LWrist), -180, 1);
  const wr = Math.max(Math.abs(rWrist), Math.abs(lWrist));

  const rKnee = p2sFix(p2s3(RAnkle, RKnee, RHip), -180, 1);
  const lKnee = p2sFix(p2s3(LAnkle, LKnee, LHip), -180, 1);
  const kneeFlex = Math.max(Math.abs(rKnee), Math.abs(lKnee));

  const trunkSeg = p2sFix(Math.atan2(
    isWorld ? (Neck[1] - Hip[1]) : (Hip[1] - Neck[1]),
    Math.sqrt(Math.pow(Neck[0] - Hip[0], 2) + Math.pow(Neck[2] - Hip[2], 2) + 1e-9),
  ) * 180 / Math.PI, 0, 1);
  const tf = Math.max(0, 90 - Math.abs(trunkSeg));

  const ts = isWorld
    ? Math.abs(Math.atan2(LShoulder[1] - RShoulder[1], Math.abs(LShoulder[0] - RShoulder[0]) + 1e-9) * 180 / Math.PI)
    : Math.abs(Math.atan2(Math.abs(LShoulder[1] - RShoulder[1]), Math.abs(LShoulder[0] - RShoulder[0]) + 1e-9) * 180 / Math.PI);

  const trunkRot = isWorld
    ? Math.abs(Math.atan2(Math.abs(LShoulder[2] - RShoulder[2]), Math.abs(LShoulder[0] - RShoulder[0]) + 1e-9) * 180 / Math.PI)
    : 0;

  const neckVec = v3(Neck, Head);
  const vert: Vec3 = isWorld ? [0, 1, 0] : [0, -1, 0];
  const nfRaw = Math.acos(Math.max(-1, Math.min(1, dot(neckVec, vert) / (mg(neckVec) * mg(vert) + 1e-9)))) * 180 / Math.PI;
  const nf = nfRaw;

  const ns = Math.abs(Math.atan2(Math.abs(LEar[1] - REar[1]), Math.abs(LEar[0] - REar[0]) + 1e-9) * 180 / Math.PI);

  const shoulderRaised = isWorld
    ? (RElbow[1] > RShoulder[1] + 0.02) || (LElbow[1] > LShoulder[1] + 0.02)
    : (RElbow[1] < RShoulder[1] - 0.02) || (LElbow[1] < LShoulder[1] - 0.02);

  const armAbducted =
    Math.abs(RElbow[0] - RShoulder[0]) > 0.08 ||
    Math.abs(LElbow[0] - LShoulder[0]) > 0.08;

  const laCross =
    Math.abs(RWrist[0] - RShoulder[0]) > 0.15 ||
    Math.abs(LWrist[0] - LShoulder[0]) > 0.15;

  const wrBent = wr > 15;

  const bilateral = Math.abs(RAnkle[1] - LAnkle[1]) < (isWorld ? 0.06 : 0.05);

  return {
    tf, ts, trunkRot, nf, ns, ua, la, wr, kneeFlex,
    bilateral, shoulderRaised, armAbducted, laCross, wrBent,
    joints: { rElbow, lElbow, rShoulder, lShoulder, rWrist, lWrist, rKnee, lKnee },
    isWorld,
  };
}

/** Verbatim port of calcRULA(ang, ti) — exact worksheet Table A/B/C lookups. */
export function calcRULA(ang: P2SAngles, ti: P2STaskInputs = { load: 0, freq: 1, grip: 0 }): P2SRulaResult {
  let ua = ang.ua <= 20 ? 1 : ang.ua <= 45 ? 2 : ang.ua <= 90 ? 3 : 4;
  if (ang.shoulderRaised) ua++;
  if (ang.armAbducted) ua++;
  let la = (ang.la >= 60 && ang.la <= 100) ? 1 : 2;
  if (ang.laCross) la++;
  let wr = ang.wr <= 0 ? 1 : ang.wr <= 15 ? 2 : 3;
  if (ang.wrBent) wr = Math.min(wr + 1, 4);
  const tableA2 = [
    [[1, 2, 2, 2], [2, 2, 2, 3], [2, 3, 3, 3]], [[2, 2, 2, 3], [2, 3, 3, 3], [3, 3, 3, 4]],
    [[3, 3, 3, 4], [3, 3, 3, 4], [3, 3, 4, 4]], [[3, 3, 4, 4], [3, 4, 4, 4], [4, 4, 4, 5]],
    [[4, 4, 4, 5], [4, 4, 4, 5], [4, 4, 5, 5]], [[5, 5, 5, 6], [6, 6, 6, 7], [7, 7, 7, 8]],
  ];
  const uaIdx = Math.min(Math.max(ua, 1), 6) - 1, laIdx = Math.min(Math.max(la, 1), 3) - 1, wrIdx = Math.min(Math.max(wr, 1), 4) - 1;
  const poseScoreA = tableA2[uaIdx][Math.min(laIdx, 2)][wrIdx];
  const muscleUse = ti.freq >= 1 ? 1 : 0;
  const force = ti.load === 0 ? 0 : ti.load === 1 ? 1 : 2;
  const wristArmScore = Math.min(poseScoreA + muscleUse + force, 8);
  let nk = ang.nf <= 10 ? 1 : ang.nf <= 20 ? 2 : ang.nf <= 30 ? 3 : 4;
  if (ang.ns > 15) nk++;
  let tr = ang.tf <= 0 ? 1 : ang.tf <= 20 ? 2 : ang.tf <= 60 ? 3 : 4;
  if (ang.ts > 10 || ang.trunkRot > 20) tr++;
  const lg = ang.bilateral ? 1 : 2;
  const tableB = [[1, 2, 3, 5, 7, 8], [2, 3, 4, 6, 7, 8], [3, 3, 5, 7, 8, 8], [5, 5, 6, 7, 8, 8], [7, 7, 7, 8, 8, 8], [8, 8, 8, 8, 8, 9]];
  const nkIdx = Math.min(Math.max(nk, 1), 6) - 1, trIdx = Math.min(Math.max(tr, 1), 6) - 1;
  const poseScoreB = Math.min(tableB[nkIdx][trIdx] + (lg - 1), 9);
  const neckTrunkLegScore = Math.min(poseScoreB + muscleUse + force, 9);
  const tableC = [[1, 2, 3, 3, 4, 5, 5], [2, 2, 3, 4, 4, 5, 5], [3, 3, 3, 4, 4, 5, 6], [3, 3, 3, 4, 5, 6, 6], [4, 4, 4, 5, 6, 7, 7], [4, 4, 5, 6, 6, 7, 7], [5, 5, 6, 6, 7, 7, 7], [5, 5, 6, 7, 7, 7, 7]];
  const fs = tableC[Math.min(Math.max(wristArmScore, 1), 8) - 1][Math.min(Math.max(neckTrunkLegScore, 1), 7) - 1];
  return { ua, la, wr, nk, tr, lg, wristArmScore, neckTrunkLegScore, poseScoreA, poseScoreB, fs };
}

/** Verbatim port of calcREBA(ang, ti) — exact worksheet Table A/B/C lookups. */
export function calcREBA(ang: P2SAngles, ti: P2STaskInputs = { load: 0, freq: 1, grip: 0 }): P2SRebaResult {
  let nk = ang.nf <= 20 ? 1 : 2;
  if (ang.ns > 15) nk++;
  let tr = ang.tf <= 5 ? 1 : ang.tf <= 20 ? 2 : ang.tf <= 60 ? 3 : 4;
  if (ang.ts > 10 || ang.trunkRot > 20) tr++;
  let lg = ang.bilateral ? 1 : 2;
  if (ang.kneeFlex > 30 && ang.kneeFlex <= 60) lg++;
  else if (ang.kneeFlex > 60) lg += 2;
  const rebaTableA = [
    [[1, 2, 3, 4], [1, 2, 3, 4], [3, 3, 5, 6]], [[2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 7]],
    [[2, 4, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8]], [[3, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9]],
    [[4, 6, 7, 8], [6, 7, 8, 9], [7, 8, 9, 9]],
  ];
  const postureScoreA = rebaTableA[Math.min(Math.max(tr, 1), 5) - 1][Math.min(Math.max(nk, 1), 3) - 1][Math.min(Math.max(lg, 1), 4) - 1];
  const force = ti.load;
  const scoreA = Math.min(postureScoreA + force, 12);
  let ua = ang.ua <= 20 ? 1 : ang.ua <= 45 ? 2 : ang.ua <= 90 ? 3 : 4;
  if (ang.shoulderRaised) ua++;
  if (ang.armAbducted) ua++;
  const la = (ang.la >= 60 && ang.la <= 100) ? 1 : 2;
  let wr = ang.wr <= 15 ? 1 : 2;
  if (ang.wrBent) wr = Math.min(wr + 1, 3);
  const rebaTableB = [
    [[1, 2, 2], [1, 2, 3]], [[1, 2, 3], [2, 3, 4]], [[3, 4, 5], [4, 5, 5]],
    [[4, 5, 5], [5, 6, 7]], [[6, 7, 8], [7, 8, 8]], [[7, 8, 8], [8, 9, 9]],
  ];
  const postureScoreB = rebaTableB[Math.min(Math.max(ua, 1), 6) - 1][Math.min(Math.max(la, 1), 2) - 1][Math.min(Math.max(wr, 1), 3) - 1];
  const coupling = ti.grip;
  const scoreB = Math.min(postureScoreB + coupling, 12);
  const rebaTableC = [
    [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7], [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8], [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
    [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9], [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 10, 10], [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
    [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11], [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11], [9, 9, 9, 9, 10, 10, 10, 11, 11, 12, 12, 12],
    [10, 10, 10, 10, 10, 11, 11, 11, 12, 12, 12, 12], [11, 11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12], [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
  ];
  const rebaScore = rebaTableC[Math.min(Math.max(scoreA, 1), 12) - 1][Math.min(Math.max(scoreB, 1), 12) - 1];
  const activity = ti.freq >= 1 ? 1 : 0;
  const fs = Math.min(rebaScore + activity, 15);
  return { nk, tr, lg, ua, la, wr, scoreA, scoreB, postureScoreA, postureScoreB, fs };
}
