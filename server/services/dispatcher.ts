import crypto from 'node:crypto';
import { execute, queryOne } from '../db.js';

export type NotificationEventType =
  | 'spaced_repetition_due'
  | 'session_auto_quiz'
  | 'recovery_plan_generated'
  | 'manual_test';

export interface AutomationSettingsRow {
  id: number;
  n8n_webhook_url: string;
  webhook_secret: string;
  whatsapp_enabled: number;
  whatsapp_phone_number_id: string;
  whatsapp_recipient_phone: string;
  push_enabled: number;
  auto_quiz_on_session_end: number;
  recovery_threshold_pct: number;
  updated_at: string;
}

export interface DispatchInput {
  eventType: NotificationEventType;
  title: string;
  message: string;
  payload: Record<string, unknown>;
}

export async function getAutomationSettings(): Promise<AutomationSettingsRow> {
  const row = await queryOne<AutomationSettingsRow>(`SELECT * FROM automation_settings WHERE id = 1`);
  return row!;
}

export async function dispatchNotification(input: DispatchInput): Promise<{
  logId: string;
  dispatchedChannels: string[];
  status: 'dispatched' | 'queued_local' | 'failed';
}> {
  const settings = await getAutomationSettings();
  const now = new Date().toISOString();
  const dispatchedChannels: string[] = [];
  let overallStatus: 'dispatched' | 'queued_local' | 'failed' = 'queued_local';
  let lastStatusCode: number | null = null;

  const fullPayload = {
    source: 'study-os',
    event: input.eventType,
    timestamp: now,
    title: input.title,
    message: input.message,
    data: input.payload,
  };

  const webhookUrl = settings.n8n_webhook_url || process.env.N8N_WEBHOOK_URL || '';
  if (webhookUrl) {
    try {
      const bodyStr = JSON.stringify(fullPayload);
      const secret = settings.webhook_secret || process.env.WEBHOOK_SECRET || 'study-os-dev-secret';
      const signature = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-StudyOS-Event': input.eventType,
          'X-StudyOS-Signature': `sha256=${signature}`,
        },
        body: bodyStr,
        signal: AbortSignal.timeout(6000),
      });
      lastStatusCode = res.status;
      dispatchedChannels.push('n8n_webhook');
      overallStatus = res.ok ? 'dispatched' : 'failed';
    } catch {
      dispatchedChannels.push('n8n_webhook');
      overallStatus = 'failed';
    }
  }

  const waToken = process.env.WHATSAPP_TOKEN || '';
  const waPhoneId = settings.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const waRecipient = settings.whatsapp_recipient_phone || process.env.WHATSAPP_RECIPIENT_PHONE || '';

  if (settings.whatsapp_enabled && waToken && waPhoneId && waRecipient) {
    try {
      const waRes = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: waRecipient,
          type: 'text',
          text: {
            body: `*${input.title}*\n${input.message}`,
          },
        }),
        signal: AbortSignal.timeout(6000),
      });
      lastStatusCode = waRes.status;
      dispatchedChannels.push('whatsapp_cloud_api');
      if (waRes.ok && overallStatus !== 'failed') {
        overallStatus = 'dispatched';
      }
    } catch {
      dispatchedChannels.push('whatsapp_cloud_api');
      overallStatus = 'failed';
    }
  }

  if (settings.push_enabled) {
    dispatchedChannels.push('pwa_push');
    if (overallStatus === 'queued_local' && !webhookUrl) {
      overallStatus = 'queued_local';
    }
  }

  const logId = crypto.randomUUID();
  await execute(
    `INSERT INTO notification_logs (id, event_type, channel, title, message, payload_json, status, response_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      logId,
      input.eventType,
      dispatchedChannels.join(',') || 'pwa_push',
      input.title,
      input.message,
      JSON.stringify(fullPayload),
      overallStatus,
      lastStatusCode,
      now,
    ]
  );

  return { logId, dispatchedChannels, status: overallStatus };
}
