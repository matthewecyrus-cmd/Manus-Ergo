/* ============================================================
   NewAssessment — ErgoKit multi-step wizard
   Steps: Job Info → RULA Inputs → REBA Inputs → Review & Score
   ============================================================ */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Activity, BarChart3, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { calcRulaScore, calcRebaScore, getRiskLevel } from "@/lib/ergo-types";
import type { RulaInputs, RebaInputs } from "@/lib/ergo-types";

const STEPS = [
  { id: 1, label: 'Job Info', icon: ClipboardList },
  { id: 2, label: 'RULA', icon: Activity },
  { id: 3, label: 'REBA', icon: BarChart3 },
  { id: 4, label: 'Results', icon: Eye },
];

const DEFAULT_RULA: RulaInputs = {
  upperArmAngle: 20,
  upperArmAbducted: false,
  shoulderRaised: false,
  upperArmSupported: false,
  lowerArmAngle: 80,
  lowerArmCrossing: false,
  wristAngle: 0,
  wristTwist: 'mid',
  neckAngle: 10,
  neckTwisted: false,
  neckSideBending: false,
  trunkAngle: 10,
  trunkTwisted: false,
  trunkSideBending: false,
  legsSupported: true,
  muscleUse: 'occasional',
  forceLoad: 'low',
};

const DEFAULT_REBA: RebaInputs = {
  neckAngle: 10,
  neckTwisted: false,
  trunkAngle: 10,
  trunkTwisted: false,
  trunkSideBending: false,
  legPosition: 'bilateral',
  kneeAngle: 0,
  upperArmAngle: 20,
  upperArmAbducted: false,
  shoulderRaised: false,
  upperArmSupported: false,
  lowerArmAngle: 80,
  wristAngle: 0,
  wristTwisted: false,
  loadForce: 'low',
  coupling: 'good',
  staticPosture: false,
  repeatedSmallRange: false,
  rapidLargeRange: false,
  unstablePosture: false,
};

export default function NewAssessment() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [jobInfo, setJobInfo] = useState({
    title: '',
    worker: '',
    department: '',
    task: '',
    assessor: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [rula, setRula] = useState<RulaInputs>(DEFAULT_RULA);
  const [reba, setReba] = useState<RebaInputs>(DEFAULT_REBA);

  const rulaResult = calcRulaScore(rula);
  const rebaResult = calcRebaScore(reba);

  function handleSave() {
    toast.success("Assessment saved successfully!", {
      description: `RULA: ${rulaResult.score} · REBA: ${rebaResult.score}`,
    });
    setTimeout(() => navigate("/assessments"), 1200);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/assessments">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Assessments
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          New Ergonomics Assessment
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Complete the RULA and REBA evaluation for a workstation or task.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = step === s.id;
          const isDone = step > s.id;
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
                  isDone ? 'bg-green-500 text-white' :
                  isActive ? 'bg-[oklch(0.28_0.07_240)] text-white' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-xs mt-1 font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 rounded-full transition-colors ${isDone ? 'bg-green-500' : 'bg-border'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {step === 1 && (
        <StepCard title="Job & Worker Information">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Assessment Title" required>
              <Input placeholder="e.g. Assembly Station 3 — Component Insertion" value={jobInfo.title} onChange={e => setJobInfo(p => ({ ...p, title: e.target.value }))} />
            </Field>
            <Field label="Worker Name">
              <Input placeholder="e.g. J. Martinez" value={jobInfo.worker} onChange={e => setJobInfo(p => ({ ...p, worker: e.target.value }))} />
            </Field>
            <Field label="Department" required>
              <Input placeholder="e.g. Production Line A" value={jobInfo.department} onChange={e => setJobInfo(p => ({ ...p, department: e.target.value }))} />
            </Field>
            <Field label="Task Description" required>
              <Input placeholder="e.g. Overhead component insertion" value={jobInfo.task} onChange={e => setJobInfo(p => ({ ...p, task: e.target.value }))} />
            </Field>
            <Field label="Assessor Name">
              <Input placeholder="e.g. Sarah Chen, CPE" value={jobInfo.assessor} onChange={e => setJobInfo(p => ({ ...p, assessor: e.target.value }))} />
            </Field>
            <Field label="Assessment Date">
              <Input type="date" value={jobInfo.date} onChange={e => setJobInfo(p => ({ ...p, date: e.target.value }))} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Observations / Notes">
                <textarea
                  className="w-full min-h-20 px-3 py-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Describe the task, postures observed, worker feedback..."
                  value={jobInfo.notes}
                  onChange={e => setJobInfo(p => ({ ...p, notes: e.target.value }))}
                />
              </Field>
            </div>
          </div>
        </StepCard>
      )}

      {step === 2 && (
        <StepCard title="RULA Assessment — Upper Limb Posture">
          <div className="space-y-5">
            <SectionLabel>Upper Arm</SectionLabel>
            <SliderField
              label={`Upper Arm Angle: ${rula.upperArmAngle}°`}
              hint="0° = neutral, 90° = fully raised"
              value={rula.upperArmAngle}
              min={-20} max={120}
              onChange={v => setRula(p => ({ ...p, upperArmAngle: v }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ToggleField label="Shoulder Raised" checked={rula.shoulderRaised} onChange={v => setRula(p => ({ ...p, shoulderRaised: v }))} />
              <ToggleField label="Upper Arm Abducted" checked={rula.upperArmAbducted} onChange={v => setRula(p => ({ ...p, upperArmAbducted: v }))} />
              <ToggleField label="Upper Arm Supported" checked={rula.upperArmSupported} onChange={v => setRula(p => ({ ...p, upperArmSupported: v }))} />
            </div>

            <SectionLabel>Lower Arm</SectionLabel>
            <SliderField
              label={`Lower Arm Angle: ${rula.lowerArmAngle}°`}
              hint="60–100° = acceptable range"
              value={rula.lowerArmAngle}
              min={0} max={150}
              onChange={v => setRula(p => ({ ...p, lowerArmAngle: v }))}
            />
            <ToggleField label="Lower Arm Crossing Midline" checked={rula.lowerArmCrossing} onChange={v => setRula(p => ({ ...p, lowerArmCrossing: v }))} />

            <SectionLabel>Wrist</SectionLabel>
            <SliderField
              label={`Wrist Angle: ${rula.wristAngle}°`}
              hint="0° = neutral, ±15° threshold"
              value={rula.wristAngle}
              min={-45} max={45}
              onChange={v => setRula(p => ({ ...p, wristAngle: v }))}
            />
            <RadioField
              label="Wrist Twist"
              value={rula.wristTwist}
              options={[{ value: 'mid', label: 'Mid-range' }, { value: 'end', label: 'End of range' }]}
              onChange={v => setRula(p => ({ ...p, wristTwist: v as 'mid' | 'end' }))}
            />

            <SectionLabel>Neck</SectionLabel>
            <SliderField
              label={`Neck Angle: ${rula.neckAngle}°`}
              hint="0–10° = acceptable, >20° = high risk"
              value={rula.neckAngle}
              min={-10} max={60}
              onChange={v => setRula(p => ({ ...p, neckAngle: v }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <ToggleField label="Neck Twisted" checked={rula.neckTwisted} onChange={v => setRula(p => ({ ...p, neckTwisted: v }))} />
              <ToggleField label="Neck Side Bending" checked={rula.neckSideBending} onChange={v => setRula(p => ({ ...p, neckSideBending: v }))} />
            </div>

            <SectionLabel>Trunk</SectionLabel>
            <SliderField
              label={`Trunk Angle: ${rula.trunkAngle}°`}
              hint="0° = upright, >20° = increased risk"
              value={rula.trunkAngle}
              min={0} max={90}
              onChange={v => setRula(p => ({ ...p, trunkAngle: v }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <ToggleField label="Trunk Twisted" checked={rula.trunkTwisted} onChange={v => setRula(p => ({ ...p, trunkTwisted: v }))} />
              <ToggleField label="Trunk Side Bending" checked={rula.trunkSideBending} onChange={v => setRula(p => ({ ...p, trunkSideBending: v }))} />
            </div>

            <SectionLabel>Legs & Load</SectionLabel>
            <ToggleField label="Legs Supported / Balanced" checked={rula.legsSupported} onChange={v => setRula(p => ({ ...p, legsSupported: v }))} />
            <RadioField
              label="Muscle Use"
              value={rula.muscleUse}
              options={[
                { value: 'occasional', label: 'Occasional (<1/min)' },
                { value: 'static', label: 'Static (>1 min)' },
                { value: 'repeated', label: 'Repeated (>4/min)' },
              ]}
              onChange={v => setRula(p => ({ ...p, muscleUse: v as any }))}
            />
            <RadioField
              label="Force / Load"
              value={rula.forceLoad}
              options={[
                { value: 'low', label: 'Low (<2 kg)' },
                { value: 'medium', label: 'Medium (2–10 kg)' },
                { value: 'high', label: 'High (>10 kg)' },
                { value: 'shock', label: 'Shock / Rapid' },
              ]}
              onChange={v => setRula(p => ({ ...p, forceLoad: v as any }))}
            />

            {/* Live score preview */}
            <div className="mt-2 p-4 rounded-lg bg-muted/40 border border-border flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>RULA Score Preview</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rulaResult.interpretation}</p>
              </div>
              <div className="text-right">
                <span className={`text-3xl font-bold ${rulaResult.score >= 7 ? 'text-red-600' : rulaResult.score >= 5 ? 'text-amber-600' : rulaResult.score >= 3 ? 'text-amber-500' : 'text-green-600'}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {rulaResult.score}
                </span>
                <p className="text-xs text-muted-foreground">Action Level {rulaResult.actionLevel}</p>
              </div>
            </div>
          </div>
        </StepCard>
      )}

      {step === 3 && (
        <StepCard title="REBA Assessment — Whole Body Posture">
          <div className="space-y-5">
            <SectionLabel>Neck</SectionLabel>
            <SliderField
              label={`Neck Angle: ${reba.neckAngle}°`}
              hint="0–20° = acceptable, <0° or >20° = risk"
              value={reba.neckAngle}
              min={-10} max={60}
              onChange={v => setReba(p => ({ ...p, neckAngle: v }))}
            />
            <ToggleField label="Neck Twisted / Side Bending" checked={reba.neckTwisted} onChange={v => setReba(p => ({ ...p, neckTwisted: v }))} />

            <SectionLabel>Trunk</SectionLabel>
            <SliderField
              label={`Trunk Angle: ${reba.trunkAngle}°`}
              hint="0° = upright, >60° = high risk"
              value={reba.trunkAngle}
              min={0} max={90}
              onChange={v => setReba(p => ({ ...p, trunkAngle: v }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <ToggleField label="Trunk Twisted" checked={reba.trunkTwisted} onChange={v => setReba(p => ({ ...p, trunkTwisted: v }))} />
              <ToggleField label="Trunk Side Bending" checked={reba.trunkSideBending} onChange={v => setReba(p => ({ ...p, trunkSideBending: v }))} />
            </div>

            <SectionLabel>Legs</SectionLabel>
            <RadioField
              label="Leg Position"
              value={reba.legPosition}
              options={[
                { value: 'bilateral', label: 'Bilateral / Sitting' },
                { value: 'unilateral', label: 'Unilateral / Walking' },
                { value: 'unstable', label: 'Unstable Surface' },
              ]}
              onChange={v => setReba(p => ({ ...p, legPosition: v as any }))}
            />
            <SliderField
              label={`Knee Angle: ${reba.kneeAngle}°`}
              hint="0° = straight, >60° = high risk"
              value={reba.kneeAngle}
              min={0} max={120}
              onChange={v => setReba(p => ({ ...p, kneeAngle: v }))}
            />

            <SectionLabel>Upper Arm</SectionLabel>
            <SliderField
              label={`Upper Arm Angle: ${reba.upperArmAngle}°`}
              hint="0° = neutral, >90° = high risk"
              value={reba.upperArmAngle}
              min={-20} max={120}
              onChange={v => setReba(p => ({ ...p, upperArmAngle: v }))}
            />
            <div className="grid grid-cols-3 gap-3">
              <ToggleField label="Shoulder Raised" checked={reba.shoulderRaised} onChange={v => setReba(p => ({ ...p, shoulderRaised: v }))} />
              <ToggleField label="Arm Abducted" checked={reba.upperArmAbducted} onChange={v => setReba(p => ({ ...p, upperArmAbducted: v }))} />
              <ToggleField label="Arm Supported" checked={reba.upperArmSupported} onChange={v => setReba(p => ({ ...p, upperArmSupported: v }))} />
            </div>

            <SectionLabel>Lower Arm & Wrist</SectionLabel>
            <SliderField
              label={`Lower Arm Angle: ${reba.lowerArmAngle}°`}
              hint="60–100° = acceptable"
              value={reba.lowerArmAngle}
              min={0} max={150}
              onChange={v => setReba(p => ({ ...p, lowerArmAngle: v }))}
            />
            <SliderField
              label={`Wrist Angle: ${reba.wristAngle}°`}
              hint="0° = neutral, ±15° threshold"
              value={reba.wristAngle}
              min={-45} max={45}
              onChange={v => setReba(p => ({ ...p, wristAngle: v }))}
            />
            <ToggleField label="Wrist Twisted" checked={reba.wristTwisted} onChange={v => setReba(p => ({ ...p, wristTwisted: v }))} />

            <SectionLabel>Load, Coupling & Activity</SectionLabel>
            <RadioField
              label="Load / Force"
              value={reba.loadForce}
              options={[
                { value: 'low', label: 'Low (<5 kg)' },
                { value: 'medium', label: 'Medium (5–10 kg)' },
                { value: 'high', label: 'High (>10 kg)' },
                { value: 'shock', label: 'Shock / Rapid' },
              ]}
              onChange={v => setReba(p => ({ ...p, loadForce: v as any }))}
            />
            <RadioField
              label="Coupling Quality"
              value={reba.coupling}
              options={[
                { value: 'good', label: 'Good (handle)' },
                { value: 'fair', label: 'Fair (acceptable)' },
                { value: 'poor', label: 'Poor (awkward)' },
                { value: 'unacceptable', label: 'Unacceptable' },
              ]}
              onChange={v => setReba(p => ({ ...p, coupling: v as any }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <ToggleField label="Static Posture (>1 min)" checked={reba.staticPosture} onChange={v => setReba(p => ({ ...p, staticPosture: v }))} />
              <ToggleField label="Repeated Small Range" checked={reba.repeatedSmallRange} onChange={v => setReba(p => ({ ...p, repeatedSmallRange: v }))} />
              <ToggleField label="Rapid Large Range" checked={reba.rapidLargeRange} onChange={v => setReba(p => ({ ...p, rapidLargeRange: v }))} />
              <ToggleField label="Unstable Posture" checked={reba.unstablePosture} onChange={v => setReba(p => ({ ...p, unstablePosture: v }))} />
            </div>

            {/* Live score preview */}
            <div className="mt-2 p-4 rounded-lg bg-muted/40 border border-border flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>REBA Score Preview</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rebaResult.interpretation}</p>
              </div>
              <div className="text-right">
                <span className={`text-3xl font-bold ${rebaResult.score >= 11 ? 'text-red-700' : rebaResult.score >= 8 ? 'text-red-500' : rebaResult.score >= 4 ? 'text-amber-600' : 'text-green-600'}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {rebaResult.score}
                </span>
                <p className="text-xs text-muted-foreground">{rebaResult.riskLevel} Risk</p>
              </div>
            </div>
          </div>
        </StepCard>
      )}

      {step === 4 && (
        <StepCard title="Assessment Results">
          <div className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <ResultCard
                label="RULA Score"
                score={rulaResult.score}
                max={7}
                actionLevel={rulaResult.actionLevel}
                interpretation={rulaResult.interpretation}
              />
              <ResultCard
                label="REBA Score"
                score={rebaResult.score}
                max={15}
                actionLevel={rebaResult.actionLevel}
                interpretation={rebaResult.interpretation}
              />
            </div>

            {/* Overall risk */}
            <div className="p-4 rounded-lg border border-border bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2" style={{ fontFamily: "'DM Sans', sans-serif" }}>Overall Risk Assessment</p>
              <div className="flex items-center gap-3">
                {(() => {
                  const maxScore = Math.max(rulaResult.score / 7, rebaResult.score / 15);
                  const level = maxScore >= 0.7 ? 'very-high' : maxScore >= 0.5 ? 'high' : maxScore >= 0.3 ? 'medium' : 'low';
                  const label = { 'low': 'Low Risk', 'medium': 'Medium Risk', 'high': 'High Risk', 'very-high': 'Very High Risk' }[level];
                  const color = { 'low': 'bg-green-100 text-green-800 border-green-200', 'medium': 'bg-amber-100 text-amber-800 border-amber-200', 'high': 'bg-red-100 text-red-800 border-red-200', 'very-high': 'bg-red-200 text-red-900 border-red-300' }[level];
                  return <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${color}`}>{label}</span>;
                })()}
              </div>
            </div>

            {/* Job summary */}
            <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'DM Sans', sans-serif" }}>Job Information</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Title: </span><span className="font-medium">{jobInfo.title || '—'}</span></div>
                <div><span className="text-muted-foreground">Worker: </span><span className="font-medium">{jobInfo.worker || '—'}</span></div>
                <div><span className="text-muted-foreground">Department: </span><span className="font-medium">{jobInfo.department || '—'}</span></div>
                <div><span className="text-muted-foreground">Task: </span><span className="font-medium">{jobInfo.task || '—'}</span></div>
                <div><span className="text-muted-foreground">Assessor: </span><span className="font-medium">{jobInfo.assessor || '—'}</span></div>
                <div><span className="text-muted-foreground">Date: </span><span className="font-medium">{jobInfo.date}</span></div>
              </div>
              {jobInfo.notes && <p className="text-xs text-muted-foreground italic border-l-2 border-amber-400 pl-2 mt-2">{jobInfo.notes}</p>}
            </div>

            <Button
              className="w-full bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white gap-2"
              onClick={handleSave}
            >
              <CheckCircle2 className="w-4 h-4" />
              Save Assessment
            </Button>
          </div>
        </StepCard>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={() => setStep(s => Math.max(1, s - 1))}
          disabled={step === 1}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Previous
        </Button>
        {step < 4 && (
          <Button
            className="bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white gap-2"
            onClick={() => setStep(s => Math.min(4, s + 1))}
          >
            Next <ArrowRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---- Sub-components ----

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-sm border-border">
      <CardContent className="p-5 space-y-4">
        <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold text-[oklch(0.28_0.07_240)] uppercase tracking-widest border-b border-border pb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {children}
    </p>
  );
}

function SliderField({ label, hint, value, min, max, onChange }: {
  label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <Slider
        min={min} max={max} step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
      <Label className="text-xs font-medium text-foreground cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function RadioField({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      <RadioGroup value={value} onValueChange={onChange} className="flex flex-wrap gap-2">
        {options.map(opt => (
          <div key={opt.value} className="flex items-center gap-1.5">
            <RadioGroupItem value={opt.value} id={`${label}-${opt.value}`} />
            <Label htmlFor={`${label}-${opt.value}`} className="text-xs text-foreground cursor-pointer">{opt.label}</Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

function ResultCard({ label, score, max, actionLevel, interpretation }: {
  label: string; score: number; max: number; actionLevel: number; interpretation: string;
}) {
  const pct = score / max;
  const color = pct >= 0.7 ? 'text-red-600' : pct >= 0.45 ? 'text-amber-600' : 'text-green-600';
  const bg = pct >= 0.7 ? 'bg-red-50 border-red-200' : pct >= 0.45 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200';
  return (
    <div className={`p-4 rounded-lg border ${bg} space-y-1`}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'DM Sans', sans-serif" }}>{label}</p>
      <p className={`text-4xl font-bold ${color}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>{score}</p>
      <p className="text-xs text-muted-foreground">Action Level {actionLevel}</p>
      <p className="text-xs text-muted-foreground leading-snug">{interpretation}</p>
    </div>
  );
}
