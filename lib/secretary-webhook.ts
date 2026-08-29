import { logError } from '@/lib/logger';

/**
 * つなぐレビュー(このアプリ)からtsunagibito-secretary(いずみさん)側のWebhookへ、
 * 承認依頼を橋渡しする(2026-08-26追加)。
 *
 * このアプリ自体にNotion/Slackの認証情報は一切持たせない設計。secretary側の
 * /api/webhooks/openframe-approval が、メンバーマスタでのメール突合・Slack投稿・
 * つなぐポータルへのタスク作成をすべて代行する。SECRETARY_WEBHOOK_URL /
 * SECRETARY_WEBHOOK_SECRET が未設定の環境ではfail-safeで何もしない(承認依頼の
 * 作成自体は失敗させない)。
 */
/**
 * コメントで@メンションされたメンバーを、secretary側の
 * /api/webhooks/review-mention へ橋渡しする(2026-08-30追加)。
 * secretary側がメール突合とつなぐポータルへのプッシュ通知を代行する。
 * SECRETARY_MENTION_WEBHOOK_URL 未設定の環境ではfail-safeで何もしない
 * (コメント投稿自体は絶対に失敗させない)。
 */
export async function notifyMentionToSecretary(params: {
  mentionedEmail: string;
  mentionedName: string;
  commentAuthor: string;
  projectName: string;
  videoTitle: string;
  commentText: string;
  timestampLabel: string;
  url: string;
}): Promise<void> {
  const webhookUrl = process.env.SECRETARY_MENTION_WEBHOOK_URL;
  const webhookSecret = process.env.SECRETARY_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${webhookSecret}`,
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logError(`Secretary mention webhook returned ${res.status}: ${text.slice(0, 300)}`, new Error('secretary mention webhook failed'));
    }
  } catch (err) {
    logError('Failed to notify secretary mention webhook:', err);
  }
}

export async function notifyApprovalRequestToSecretary(params: {
  approverEmail: string;
  requesterName: string;
  projectName: string;
  videoTitle: string;
  versionLabel: string;
  message?: string;
  url: string;
}): Promise<void> {
  const webhookUrl = process.env.SECRETARY_WEBHOOK_URL;
  const webhookSecret = process.env.SECRETARY_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) return;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${webhookSecret}`,
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logError(`Secretary webhook returned ${res.status}: ${text.slice(0, 300)}`, new Error('secretary webhook failed'));
    }
  } catch (err) {
    logError('Failed to notify secretary webhook:', err);
  }
}
