import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Play, Save, Send, Webhook, XCircle } from 'lucide-react';
import { api } from '../api/client';
import type { AutomationSettings, NotificationLog } from '../types';

interface AutomationCenterProps {
  notificationPermission: NotificationPermission;
  onRequestNotifications: () => Promise<NotificationPermission>;
  onShowLocalNotification: (title: string, body: string) => Promise<void>;
}

export function AutomationCenter({
  notificationPermission,
  onRequestNotifications,
  onShowLocalNotification,
}: AutomationCenterProps) {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const load = async () => {
    const [s, l] = await Promise.all([api.getAutomationSettings(), api.getNotificationLogs()]);
    setSettings(s);
    setLogs(l);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.updateAutomationSettings({
        n8n_webhook_url: settings.n8n_webhook_url,
        webhook_secret: settings.webhook_secret,
        whatsapp_enabled: Boolean(settings.whatsapp_enabled),
        whatsapp_phone_number_id: settings.whatsapp_phone_number_id,
        whatsapp_recipient_phone: settings.whatsapp_recipient_phone,
        push_enabled: Boolean(settings.push_enabled),
        auto_quiz_on_session_end: Boolean(settings.auto_quiz_on_session_end),
        recovery_threshold_pct: Number(settings.recovery_threshold_pct),
      });
      setSettings(updated);
      setSavedMsg('Saved!');
      setTimeout(() => setSavedMsg(''), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleTestDispatch = async () => {
    const title = 'Time for your Spaced Repetition review on Pre-Calculus: Limits';
    const message = '3 cards due now + 5-Question Active Recall ready.';
    await api.testDispatch({ title, message });
    await onShowLocalNotification(title, message);
    await load();
  };

  const handleRunScheduler = async () => {
    await api.runSchedulerNow();
    await load();
  };

  if (!settings) {
    return <p className="text-sm text-zinc-400">Loading automation settings...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
            n8n · Evolution API (WhatsApp QR Code) · Web Push
          </p>
          <h1 className="heading-fluid font-bold text-zinc-50">Automações & Webhooks</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRunScheduler}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-800"
          >
            <Play className="h-3.5 w-3.5 text-emerald-400" />
            Checar Revisões Agora
          </button>
          <button
            type="button"
            onClick={handleTestDispatch}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-violet-500 px-4 text-xs font-semibold text-white hover:bg-violet-400"
          >
            <Send className="h-3.5 w-3.5" />
            Test Dispatch
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Settings Form */}
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 lg:col-span-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Webhook className="h-4 w-4 text-violet-400" />
              Dispatcher Configuration
            </div>
            <button
              type="button"
              onClick={onRequestNotifications}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
            >
              <Bell className="h-3.5 w-3.5 text-cyan-400" />
              Push: {notificationPermission}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">
              n8n Webhook URL (POST target for SR reminders, Auto-Quiz, & Recovery Plans)
            </label>
            <input
              type="url"
              value={settings.n8n_webhook_url}
              onChange={(e) => setSettings({ ...settings, n8n_webhook_url: e.target.value })}
              placeholder="https://your-n8n-instance.app/webhook/study-os"
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-400">
                HMAC Webhook Secret
              </label>
              <input
                type="text"
                value={settings.webhook_secret}
                onChange={(e) => setSettings({ ...settings, webhook_secret: e.target.value })}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 font-mono text-xs text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400">
                Recovery Plan Threshold (%)
              </label>
              <input
                type="number"
                min={30}
                max={95}
                value={settings.recovery_threshold_pct}
                onChange={(e) =>
                  setSettings({ ...settings, recovery_threshold_pct: Number(e.target.value) })
                }
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-400">
                WhatsApp Phone Number ID
              </label>
              <input
                type="text"
                value={settings.whatsapp_phone_number_id}
                onChange={(e) =>
                  setSettings({ ...settings, whatsapp_phone_number_id: e.target.value })
                }
                placeholder="1029384756..."
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400">
                WhatsApp Recipient (E.164)
              </label>
              <input
                type="text"
                value={settings.whatsapp_recipient_phone}
                onChange={(e) =>
                  setSettings({ ...settings, whatsapp_recipient_phone: e.target.value })
                }
                placeholder="+5511999999999"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="flex min-h-[36px] cursor-pointer items-center gap-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={Boolean(settings.auto_quiz_on_session_end)}
                onChange={(e) =>
                  setSettings({ ...settings, auto_quiz_on_session_end: e.target.checked ? 1 : 0 })
                }
                className="h-4 w-4 accent-cyan-400"
              />
              Auto-Quiz Trigger: Generate & dispatch 5Q quiz when study session ends
            </label>
            <label className="flex min-h-[36px] cursor-pointer items-center gap-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={Boolean(settings.push_enabled)}
                onChange={(e) =>
                  setSettings({ ...settings, push_enabled: e.target.checked ? 1 : 0 })
                }
                className="h-4 w-4 accent-cyan-400"
              />
              Enable PWA Push / In-App Notification Queue
            </label>
            <label className="flex min-h-[36px] cursor-pointer items-center gap-3 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={Boolean(settings.whatsapp_enabled)}
                onChange={(e) =>
                  setSettings({ ...settings, whatsapp_enabled: e.target.checked ? 1 : 0 })
                }
                className="h-4 w-4 accent-cyan-400"
              />
              Enable Direct WhatsApp Cloud API Dispatch (requires WHATSAPP_TOKEN env)
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-cyan-400"
          >
            <Save className="h-4 w-4" />
            {savedMsg || (saving ? 'Saving...' : 'Save Automation Settings')}
          </button>
        </form>

        {/* Live Delivery Logs */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 lg:col-span-6">
          <h2 className="text-sm font-semibold text-zinc-100">
            Outbound Webhook & Notification Logs
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Signed with <code className="text-cyan-400">X-StudyOS-Signature</code> (HMAC-SHA256).
          </p>

          <div className="mt-4 max-h-[440px] space-y-2.5 overflow-y-auto pr-1">
            {logs.length === 0 ? (
              <p className="text-sm text-zinc-500">No dispatches yet. Click "Test Dispatch" above.</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-mono text-zinc-300">
                      {log.event_type}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        log.status === 'dispatched'
                          ? 'text-emerald-400'
                          : log.status === 'failed'
                            ? 'text-rose-400'
                            : 'text-cyan-400'
                      }`}
                    >
                      {log.status === 'failed' ? (
                        <XCircle className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {log.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-zinc-100">{log.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{log.message}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Channels: {log.channel}</span>
                    <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* WhatsApp AI Tutor Inbound Endpoint */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Tutor IA no WhatsApp (n8n Inbound)</h2>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
            Notas + Projetos + PDFs + Biblioteca
          </span>
        </div>
        <p className="text-xs text-zinc-400">
          Configure seu fluxo no n8n para encaminhar mensagens do WhatsApp via <code className="text-cyan-300">POST</code> para:
        </p>
        <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-300">
{`POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/automation/whatsapp-tutor
Headers: { "Content-Type": "application/json", "x-studyos-secret": "<seu-webhook-secret>" }
Body:    { "message": "Resumo da minha nota de Cálculo" }
Retorno: { "ok": true, "reply": "...", "citations": [...] }`}
        </pre>
      </section>
    </div>
  );
}
