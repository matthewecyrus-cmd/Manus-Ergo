/* ============================================================
   Settings — ErgoKit configuration page
   Organization profile · Assessors · Notification preferences
   ============================================================ */
import { useState } from "react";
import { Save, Plus, Trash2, User, Building2, Bell, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const TABS = [
  { id: 'org', label: 'Organization', icon: Building2 },
  { id: 'assessors', label: 'Assessors', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'risk', label: 'Risk Thresholds', icon: Shield },
];

const DEFAULT_ASSESSORS = [
  { id: '1', name: 'Sarah Chen', title: 'CPE', email: 'sarah.chen@company.com', active: true },
  { id: '2', name: 'Mike Rivera', title: 'CPE', email: 'mike.rivera@company.com', active: true },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('org');
  const [org, setOrg] = useState({
    name: 'Acme Manufacturing Co.',
    site: 'Main Plant — Building A',
    address: '123 Industrial Blvd, Detroit, MI 48201',
    contact: 'EHS Department',
    email: 'ehs@acme.com',
  });
  const [assessors, setAssessors] = useState(DEFAULT_ASSESSORS);
  const [newAssessor, setNewAssessor] = useState({ name: '', title: '', email: '' });
  const [notifications, setNotifications] = useState({
    highRiskAlert: true,
    actionDueReminder: true,
    weeklyDigest: false,
    newAssessmentNotify: true,
  });
  const [thresholds, setThresholds] = useState({
    rulaHigh: 5,
    rebaHigh: 8,
    overallHigh: 7,
  });

  function handleSave() {
    toast.success("Settings saved successfully!");
  }

  function addAssessor() {
    if (!newAssessor.name || !newAssessor.email) {
      toast.error("Name and email are required.");
      return;
    }
    setAssessors(prev => [...prev, { id: Date.now().toString(), ...newAssessor, active: true }]);
    setNewAssessor({ name: '', title: '', email: '' });
    toast.success("Assessor added.");
  }

  function removeAssessor(id: string) {
    setAssessors(prev => prev.filter(a => a.id !== id));
    toast.success("Assessor removed.");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure your ErgoKit workspace and preferences.</p>
      </div>

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <div className="w-44 flex-shrink-0 space-y-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150 ${
                  activeTab === tab.id
                    ? 'bg-[oklch(0.28_0.07_240)] text-white'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'org' && (
            <Card className="shadow-sm border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Organization Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Organization Name">
                    <Input value={org.name} onChange={e => setOrg(p => ({ ...p, name: e.target.value }))} />
                  </Field>
                  <Field label="Site / Facility">
                    <Input value={org.site} onChange={e => setOrg(p => ({ ...p, site: e.target.value }))} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Address">
                      <Input value={org.address} onChange={e => setOrg(p => ({ ...p, address: e.target.value }))} />
                    </Field>
                  </div>
                  <Field label="EHS Contact">
                    <Input value={org.contact} onChange={e => setOrg(p => ({ ...p, contact: e.target.value }))} />
                  </Field>
                  <Field label="EHS Email">
                    <Input type="email" value={org.email} onChange={e => setOrg(p => ({ ...p, email: e.target.value }))} />
                  </Field>
                </div>
                <div className="pt-2">
                  <Button onClick={handleSave} className="bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white gap-2 text-sm">
                    <Save className="w-4 h-4" /> Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'assessors' && (
            <Card className="shadow-sm border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Assessors</CardTitle>
                <p className="text-xs text-muted-foreground">Manage the team members who conduct ergonomics assessments.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Existing assessors */}
                <div className="space-y-2">
                  {assessors.map(a => (
                    <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                      <div className="w-8 h-8 rounded-full bg-[oklch(0.28_0.07_240)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        {a.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>{a.name}{a.title ? `, ${a.title}` : ''}</p>
                        <p className="text-xs text-muted-foreground">{a.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={a.active} onCheckedChange={v => setAssessors(prev => prev.map(x => x.id === a.id ? { ...x, active: v } : x))} />
                        <button onClick={() => removeAssessor(a.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Add new */}
                <div>
                  <p className="text-xs font-semibold text-foreground mb-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>Add Assessor</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input placeholder="Full Name" value={newAssessor.name} onChange={e => setNewAssessor(p => ({ ...p, name: e.target.value }))} className="text-sm" />
                    <Input placeholder="Title (e.g. CPE)" value={newAssessor.title} onChange={e => setNewAssessor(p => ({ ...p, title: e.target.value }))} className="text-sm" />
                    <Input placeholder="Email" type="email" value={newAssessor.email} onChange={e => setNewAssessor(p => ({ ...p, email: e.target.value }))} className="text-sm" />
                  </div>
                  <Button onClick={addAssessor} size="sm" className="mt-3 bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white gap-2 text-xs">
                    <Plus className="w-3.5 h-3.5" /> Add Assessor
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card className="shadow-sm border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: 'highRiskAlert', label: 'High Risk Alerts', desc: 'Notify when a new high or very-high risk assessment is completed' },
                  { key: 'actionDueReminder', label: 'Action Due Reminders', desc: 'Remind assessors when corrective actions are approaching their due date' },
                  { key: 'weeklyDigest', label: 'Weekly Digest', desc: 'Receive a weekly summary of assessment activity and open actions' },
                  { key: 'newAssessmentNotify', label: 'New Assessment Notifications', desc: 'Notify the team when a new assessment is created' },
                ].map(item => (
                  <div key={item.key} className="flex items-start justify-between gap-4 py-3 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                    <Switch
                      checked={notifications[item.key as keyof typeof notifications]}
                      onCheckedChange={v => setNotifications(p => ({ ...p, [item.key]: v }))}
                    />
                  </div>
                ))}
                <Button onClick={handleSave} className="bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white gap-2 text-sm mt-2">
                  <Save className="w-4 h-4" /> Save Preferences
                </Button>
              </CardContent>
            </Card>
          )}

          {activeTab === 'risk' && (
            <Card className="shadow-sm border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>Risk Score Thresholds</CardTitle>
                <p className="text-xs text-muted-foreground">Define the score thresholds that trigger high-risk classification.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="RULA High Risk Threshold (max 7)">
                    <Input
                      type="number" min={1} max={7}
                      value={thresholds.rulaHigh}
                      onChange={e => setThresholds(p => ({ ...p, rulaHigh: Number(e.target.value) }))}
                    />
                  </Field>
                  <Field label="REBA High Risk Threshold (max 15)">
                    <Input
                      type="number" min={1} max={15}
                      value={thresholds.rebaHigh}
                      onChange={e => setThresholds(p => ({ ...p, rebaHigh: Number(e.target.value) }))}
                    />
                  </Field>
                  <Field label="Overall Risk Threshold (max 10)">
                    <Input
                      type="number" min={1} max={10}
                      value={thresholds.overallHigh}
                      onChange={e => setThresholds(p => ({ ...p, overallHigh: Number(e.target.value) }))}
                    />
                  </Field>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-800 font-medium" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    Note: These thresholds follow RULA and REBA published guidelines. Adjust only if your organization has specific requirements validated by a certified ergonomist.
                  </p>
                </div>
                <Button onClick={handleSave} className="bg-[oklch(0.28_0.07_240)] hover:bg-[oklch(0.35_0.07_240)] text-white gap-2 text-sm">
                  <Save className="w-4 h-4" /> Save Thresholds
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>{label}</Label>
      {children}
    </div>
  );
}
