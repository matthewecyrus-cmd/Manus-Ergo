/**
 * TaskSetup — ErgoKit
 * Configure task profile (load, rep rate, coupling, etc.) before a live scan.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { Settings2, ArrowRight, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSession } from '@/contexts/SessionContext';
import type { TaskProfile } from '@/lib/ergo-engine';
import { DEFAULT_TASK_PROFILE } from '@/lib/ergo-engine';
import { toast } from 'sonner';

export default function TaskSetup() {
  const { taskProfile, setTaskProfile } = useSession();
  const [form, setForm] = useState<TaskProfile>({ ...taskProfile });
  const [, navigate] = useLocation();

  function update<K extends keyof TaskProfile>(key: K, value: TaskProfile[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleStart() {
    setTaskProfile(form);
    toast.success('Task profile saved', { description: `Starting scan for: ${form.taskName}` });
    navigate('/scan');
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          Task Setup
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure the task parameters used by the Hybrid Inference Engine for NIOSH and RSI calculations.
        </p>
      </div>

      {/* Task name */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Task Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Task Name</Label>
            <input
              type="text"
              value={form.taskName}
              onChange={e => update('taskName', e.target.value)}
              className="mt-1.5 w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Assembly Line Station 3"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dominant Side</Label>
              <Select value={form.dominantSide} onValueChange={v => update('dominantSide', v as TaskProfile['dominantSide'])}>
                <SelectTrigger className="mt-1.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="right">Right</SelectItem>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="bilateral">Bilateral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Task Duration</Label>
              <Select value={form.duration} onValueChange={v => update('duration', v as TaskProfile['duration'])}>
                <SelectTrigger className="mt-1.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short (&lt;1 hr)</SelectItem>
                  <SelectItem value="moderate">Moderate (1–2 hr)</SelectItem>
                  <SelectItem value="long">Long (&gt;2 hr)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Load & repetition */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Load & Repetition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SliderField
            label="Object / Load Weight"
            unit="kg"
            value={form.loadWeight}
            min={0} max={50} step={0.5}
            onChange={v => update('loadWeight', v)}
            hint="Weight of the object being handled"
          />
          <SliderField
            label="Repetition Rate"
            unit="reps/min"
            value={form.repRate}
            min={0} max={60} step={1}
            onChange={v => update('repRate', v)}
            hint="Number of task cycles per minute"
          />
          <SliderField
            label="Cycle Duration"
            unit="sec"
            value={form.cycleDuration}
            min={1} max={120} step={1}
            onChange={v => update('cycleDuration', v)}
            hint="Duration of a single task cycle"
          />
        </CardContent>
      </Card>

      {/* NIOSH parameters */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>NIOSH Lifting Parameters</CardTitle>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Revised Lifting Equation</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <SliderField
            label="Horizontal Distance"
            unit="cm"
            value={form.horizontalDistance}
            min={10} max={80} step={1}
            onChange={v => update('horizontalDistance', v)}
            hint="Distance from body midpoint to load (horizontal)"
          />
          <SliderField
            label="Vertical Origin Height"
            unit="cm"
            value={form.verticalOrigin}
            min={0} max={180} step={1}
            onChange={v => update('verticalOrigin', v)}
            hint="Height of load at start of lift"
          />
          <SliderField
            label="Vertical Destination Height"
            unit="cm"
            value={form.verticalDestination}
            min={0} max={180} step={1}
            onChange={v => update('verticalDestination', v)}
            hint="Height of load at end of lift"
          />
          <SliderField
            label="Asymmetry Angle"
            unit="°"
            value={form.asymmetryAngle}
            min={0} max={135} step={5}
            onChange={v => update('asymmetryAngle', v)}
            hint="Angle of trunk rotation from sagittal plane"
          />
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Coupling Quality</Label>
            <Select value={form.coupling} onValueChange={v => update('coupling', v as TaskProfile['coupling'])}>
              <SelectTrigger className="mt-1.5 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Good — Optimal handles, secure grip</SelectItem>
                <SelectItem value="fair">Fair — Acceptable grip, no handles</SelectItem>
                <SelectItem value="poor">Poor — Awkward, slippery, or sharp edges</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Start button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => { setForm({ ...DEFAULT_TASK_PROFILE }); }}>
          Reset Defaults
        </Button>
        <Button
          onClick={handleStart}
          className="gap-2 bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white"
        >
          Start Live Scan <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function SliderField({
  label, unit, value, min, max, step, onChange, hint,
}: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
        <span className="text-sm font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {value} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
      {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}
