"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { User, Key, Bell, Eye, EyeOff, Copy, Check } from "lucide-react";

export default function SettingsPage() {
  const [name, setName] = useState("Demo User");
  const [email, setEmail] = useState("demo@trendsupply.com");
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [trendAlerts, setTrendAlerts] = useState(true);
  const [outreachUpdates, setOutreachUpdates] = useState(false);

  const mockApiKey = "ts_live_a1b2c3d4e5f6g7h8i9j0";

  function handleCopyApiKey() {
    navigator.clipboard.writeText(mockApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your account and preferences
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5">
            <Key className="h-4 w-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile Settings
              </CardTitle>
              <CardDescription>Update your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-name">Full Name</Label>
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-email">Email</Label>
                <Input
                  id="settings-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input id="current-password" type="password" placeholder="Enter current password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" placeholder="Enter new password" />
              </div>
              <div className="flex justify-end">
                <Button>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4" />
                API Key Management
              </CardTitle>
              <CardDescription>Manage your API keys for programmatic access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">Production API Key</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Created Mar 1, 2026</p>
                  </div>
                  <Badge variant="success">Active</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-mono">
                    {showApiKey ? mockApiKey : "ts_live_****************************"}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="shrink-0"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyApiKey}
                    className="shrink-0"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="outline">Generate New Key</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notification Preferences
              </CardTitle>
              <CardDescription>Choose what notifications you receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  id: "email-notifs",
                  label: "Email Notifications",
                  description: "Receive email notifications for important updates",
                  checked: emailNotifs,
                  onChange: setEmailNotifs,
                },
                {
                  id: "trend-alerts",
                  label: "Trend Alerts",
                  description: "Get notified when new high-growth trends are detected",
                  checked: trendAlerts,
                  onChange: setTrendAlerts,
                },
                {
                  id: "outreach-updates",
                  label: "Outreach Updates",
                  description: "Receive updates when suppliers respond to outreach",
                  checked: outreachUpdates,
                  onChange: setOutreachUpdates,
                },
              ].map((pref) => (
                <div
                  key={pref.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 p-4"
                >
                  <div>
                    <p className="font-medium text-sm">{pref.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{pref.description}</p>
                  </div>
                  <button
                    onClick={() => pref.onChange(!pref.checked)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      pref.checked ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        pref.checked ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
              <div className="flex justify-end">
                <Button>Save Preferences</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
