import { db } from '@/lib/db';
import nodemailer from 'nodemailer';
import {
  EMAIL_COLORS,
  brandedEmailTemplate,
  emailButton,
  emailHeading,
  emailHighlight,
  emailRow,
  escapeHtml,
  rawEmailHtml,
} from '@/lib/email-brand';
import { logError } from '@/lib/logger';

// ============================================
// NOTIFICATION CHANNELS
// ============================================

/**
 * Send a message via Telegram Bot API with optional inline keyboard button.
 */
async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
  buttonLabel?: string,
  buttonUrl?: string
): Promise<boolean> {
  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
    };

    // Add inline keyboard button for clickable URL (Telegram requires HTTPS)
    if (buttonLabel && buttonUrl && buttonUrl.startsWith('https://')) {
      payload.reply_markup = {
        inline_keyboard: [[{ text: buttonLabel, url: buttonUrl }]],
      };
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Telegram API error:', res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    logError('Telegram send failed:', err);
    return false;
  }
}

/**
 * Create a nodemailer SMTP transporter from environment variables.
 * Required env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
 */
function createSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Send an email notification via SMTP.
 * Requires SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD environment variables.
 * Falls back to logging if not configured.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = createSmtpTransport();
  const fromAddress =
    process.env.SMTP_FROM || process.env.EMAIL_FROM || 'つなぐレビュー <info@open-frame.net>';

  if (!transporter) {
    console.warn('SMTP not configured — skipping email notification');
    return false;
  }

  try {
    await transporter.sendMail({ from: fromAddress, to, subject, html });
    return true;
  } catch (err) {
    logError('Email send failed:', err);
    return false;
  }
}

// ============================================
// NOTIFICATION EVENT TYPES
// ============================================

export type NotificationEvent =
  | { type: 'new_video'; projectName: string; videoTitle: string; addedBy: string; url: string }
  | {
      type: 'new_version';
      projectName: string;
      videoTitle: string;
      versionLabel: string;
      addedBy: string;
      url: string;
    }
  | {
      type: 'new_comment';
      projectName: string;
      videoTitle: string;
      commentAuthor: string;
      commentText: string;
      timestamp: string;
      url: string;
    }
  | {
      type: 'new_reply';
      projectName: string;
      videoTitle: string;
      replyAuthor: string;
      replyText: string;
      parentAuthor: string;
      timestamp: string;
      url: string;
    }
  | {
      type: 'approval_requested';
      projectName: string;
      videoTitle: string;
      versionLabel: string;
      requestedBy: string;
      message?: string;
      url: string;
    }
  | {
      type: 'approval_action';
      projectName: string;
      videoTitle: string;
      versionLabel: string;
      actorName: string;
      action: 'approved' | 'rejected';
      note?: string;
      url: string;
    }
  | {
      type: 'approval_completed';
      projectName: string;
      videoTitle: string;
      versionLabel: string;
      approvedByCount: number;
      url: string;
    }
  | {
      type: 'approval_rejected';
      projectName: string;
      videoTitle: string;
      versionLabel: string;
      rejectedBy: string;
      note?: string;
      url: string;
    };

/** Structured Telegram message with text body + button label/URL */
interface TelegramMessage {
  text: string;
  buttonLabel: string;
  buttonUrl: string;
}

/**
 * Format a notification event into a Telegram message with an inline keyboard button.
 * The URL is no longer in the text body — it's attached as a clickable button instead.
 */
function formatTelegramMessage(event: NotificationEvent, timezone: string): TelegramMessage {
  const now = formatNow(timezone);
  switch (event.type) {
    case 'new_video':
      return {
        text:
          `🎬 動画が追加されました\n\n` +
          `▸ プロジェクト: ${event.projectName}\n` +
          `▸ 動画: ${event.videoTitle}\n` +
          `▸ 追加者: ${event.addedBy}\n` +
          `▸ ${now}`,
        buttonLabel: '動画を見る',
        buttonUrl: event.url,
      };
    case 'new_version':
      return {
        text:
          `🎬 新しいバージョンが追加されました\n\n` +
          `▸ プロジェクト: ${event.projectName}\n` +
          `▸ 動画: ${event.videoTitle}\n` +
          `▸ バージョン: ${event.versionLabel}\n` +
          `▸ 追加者: ${event.addedBy}\n` +
          `▸ ${now}`,
        buttonLabel: 'バージョンを見る',
        buttonUrl: event.url,
      };
    case 'new_comment':
      return {
        text:
          `💬 新しいコメント\n\n` +
          `▸ プロジェクト: ${event.projectName}\n` +
          `▸ 動画: ${event.videoTitle}\n` +
          `▸ 投稿者: ${event.commentAuthor}（${event.timestamp}）\n` +
          `▸ ${now}\n\n` +
          `"${truncate(event.commentText, 200)}"`,
        buttonLabel: 'コメントを見る',
        buttonUrl: event.url,
      };
    case 'new_reply':
      return {
        text:
          `↩️ 新しい返信\n\n` +
          `▸ プロジェクト: ${event.projectName}\n` +
          `▸ 動画: ${event.videoTitle}\n` +
          `▸ ${event.replyAuthor} さんが ${event.parentAuthor} さんに返信\n` +
          `▸ ${now}\n\n` +
          `"${truncate(event.replyText, 200)}"`,
        buttonLabel: '返信を見る',
        buttonUrl: event.url,
      };
    case 'approval_requested':
      return {
        text:
          `✅ 承認依頼\n\n` +
          `▸ プロジェクト: ${event.projectName}\n` +
          `▸ 動画: ${event.videoTitle}\n` +
          `▸ バージョン: ${event.versionLabel}\n` +
          `▸ 依頼者: ${event.requestedBy}\n` +
          `▸ ${now}` +
          (event.message ? `\n\n"${truncate(event.message, 200)}"` : ''),
        buttonLabel: '依頼を確認',
        buttonUrl: event.url,
      };
    case 'approval_action':
      return {
        text:
          `✅ 承認の更新\n\n` +
          `▸ プロジェクト: ${event.projectName}\n` +
          `▸ 動画: ${event.videoTitle}\n` +
          `▸ バージョン: ${event.versionLabel}\n` +
          `▸ ${event.actorName}（${event.action === 'approved' ? '承認' : '却下'}）\n` +
          `▸ ${now}` +
          (event.note ? `\n\n"${truncate(event.note, 200)}"` : ''),
        buttonLabel: '依頼を開く',
        buttonUrl: event.url,
      };
    case 'approval_completed':
      return {
        text:
          `✅ 承認が完了しました\n\n` +
          `▸ プロジェクト: ${event.projectName}\n` +
          `▸ 動画: ${event.videoTitle}\n` +
          `▸ バージョン: ${event.versionLabel}\n` +
          `▸ 承認者数: ${event.approvedByCount}\n` +
          `▸ ${now}`,
        buttonLabel: 'バージョンを開く',
        buttonUrl: event.url,
      };
    case 'approval_rejected':
      return {
        text:
          `⛔ 承認が却下されました\n\n` +
          `▸ プロジェクト: ${event.projectName}\n` +
          `▸ 動画: ${event.videoTitle}\n` +
          `▸ バージョン: ${event.versionLabel}\n` +
          `▸ 却下者: ${event.rejectedBy}\n` +
          `▸ ${now}` +
          (event.note ? `\n\n"${truncate(event.note, 200)}"` : ''),
        buttonLabel: '依頼を開く',
        buttonUrl: event.url,
      };
  }
}

// ============================================
// EMAIL TEMPLATE
// ============================================

function emailTemplate(body: string): string {
  const baseUrl = process.env.NEXTAUTH_URL || '';
  return brandedEmailTemplate(body, {
    footerText: 'メール通知が有効になっているため、このメールが送信されています。',
    footerLinkText: '配信停止・通知設定の管理',
    footerLinkUrl: `${baseUrl}/settings`,
  });
}

/**
 * Format a notification event into an email subject + full branded HTML email.
 */
function formatEmail(
  event: NotificationEvent,
  timezone: string
): { subject: string; html: string } {
  const now = formatNow(timezone);
  switch (event.type) {
    case 'new_video':
      return {
        subject: `[つなぐレビュー] ${event.projectName} に新しい動画: ${event.videoTitle}`,
        html: emailTemplate(`
                    <tr>${emailHeading('▶', '動画が追加されました')}</tr>
                    <tr><td style="padding:20px;">
                      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
                        ${emailRow('プロジェクト', event.projectName, true)}
                        ${emailRow('動画', event.videoTitle, true)}
                        ${emailRow('追加者', event.addedBy)}
                        ${emailRow('日時', now)}
                      </table>
                      ${emailButton('動画を見る  →', event.url)}
                    </td></tr>
                `),
      };
    case 'new_version':
      return {
        subject: `[つなぐレビュー] ${event.projectName} の ${event.videoTitle} に新しいバージョン`,
        html: emailTemplate(`
                    <tr>${emailHeading('▶', '新しいバージョンが追加されました')}</tr>
                    <tr><td style="padding:20px;">
                      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
                        ${emailRow('プロジェクト', event.projectName, true)}
                        ${emailRow('動画', event.videoTitle, true)}
                        ${emailRow('バージョン', event.versionLabel)}
                        ${emailRow('追加者', event.addedBy)}
                        ${emailRow('日時', now)}
                      </table>
                      ${emailButton('バージョンを見る  →', event.url)}
                    </td></tr>
                `),
      };
    case 'new_comment':
      return {
        subject: `[つなぐレビュー] ${event.videoTitle} に新しいコメント`,
        html: emailTemplate(`
                    <tr>${emailHeading('●', '新しいコメント')}</tr>
                    <tr><td style="padding:20px;">
                      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
                        ${emailRow('プロジェクト', event.projectName, true)}
                        ${emailRow('動画', event.videoTitle, true)}
                        ${emailRow('投稿者', event.commentAuthor)}
                        ${emailRow('位置', event.timestamp)}
                        ${emailRow('日時', now)}
                      </table>
                      <div style="border-left:2px solid #7aa7ff;padding:10px 14px;margin:0 0 20px;background-color:#2f2f2f;color:#c6c6cc;font-size:13px;line-height:1.6;">
                        ${escapeHtml(truncate(event.commentText, 300))}
                      </div>
                      ${emailButton('コメントを見る  →', event.url)}
                    </td></tr>
                `),
      };
    case 'new_reply':
      return {
        subject: `[つなぐレビュー] ${event.replyAuthor} さんが ${event.videoTitle} に返信`,
        html: emailTemplate(`
                    <tr>${emailHeading('↵', '新しい返信')}</tr>
                    <tr><td style="padding:20px;">
                      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
                        ${emailRow('プロジェクト', event.projectName, true)}
                        ${emailRow('動画', event.videoTitle, true)}
                        ${emailRow('返信元', rawEmailHtml(`<span style="color:${EMAIL_COLORS.text};font-weight:500;">${escapeHtml(event.replyAuthor)}</span> <span style="color:${EMAIL_COLORS.textDim};">&#8594;</span> ${escapeHtml(event.parentAuthor)}`))}
                        ${emailRow('日時', now)}
                      </table>
                      <div style="border-left:2px solid #7aa7ff;padding:10px 14px;margin:0 0 20px;background-color:#2f2f2f;color:#c6c6cc;font-size:13px;line-height:1.6;">
                        ${escapeHtml(truncate(event.replyText, 300))}
                      </div>
                      ${emailButton('返信を見る  →', event.url)}
                    </td></tr>
                `),
      };
    case 'approval_requested':
      return {
        subject: `[つなぐレビュー] ${event.projectName} の ${event.versionLabel} に承認依頼`,
        html: emailTemplate(`
                    <tr>${emailHeading('✓', '承認依頼')}</tr>
                    <tr><td style="padding:20px;">
                      ${emailHighlight(`新しい承認依頼があなたの対応を待っています。`)}
                      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
                        ${emailRow('プロジェクト', event.projectName, true)}
                        ${emailRow('動画', event.videoTitle, true)}
                        ${emailRow('バージョン', event.versionLabel)}
                        ${emailRow('依頼者', event.requestedBy)}
                        ${emailRow('日時', now)}
                      </table>
                      ${event.message ? `<div style="border-left:2px solid #7aa7ff;padding:10px 14px;margin:0 0 20px;background-color:#2f2f2f;color:#c6c6cc;font-size:13px;line-height:1.6;">${escapeHtml(truncate(event.message, 300))}</div>` : ''}
                      ${emailButton('依頼を確認  →', event.url)}
                    </td></tr>
                `),
      };
    case 'approval_action':
      return {
        subject: `[つなぐレビュー] ${event.actorName} さんが承認依頼を${event.action === 'approved' ? '承認' : '却下'}`,
        html: emailTemplate(`
                    <tr>${emailHeading('✓', '承認の更新')}</tr>
                    <tr><td style="padding:20px;">
                      ${emailHighlight(`${event.actorName} さんがこの依頼を${event.action === 'approved' ? '承認' : '却下'}しました。`)}
                      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
                        ${emailRow('プロジェクト', event.projectName, true)}
                        ${emailRow('動画', event.videoTitle, true)}
                        ${emailRow('バージョン', event.versionLabel)}
                        ${emailRow('操作', `${event.actorName}（${event.action === 'approved' ? '承認' : '却下'}）`)}
                        ${emailRow('日時', now)}
                      </table>
                      ${event.note ? `<div style="border-left:2px solid #7aa7ff;padding:10px 14px;margin:0 0 20px;background-color:#2f2f2f;color:#c6c6cc;font-size:13px;line-height:1.6;">${escapeHtml(truncate(event.note, 300))}</div>` : ''}
                      ${emailButton('依頼を開く  →', event.url)}
                    </td></tr>
                `),
      };
    case 'approval_completed':
      return {
        subject: `[つなぐレビュー] ${event.versionLabel} の承認が完了`,
        html: emailTemplate(`
                    <tr>${emailHeading('✓', '承認が完了しました')}</tr>
                    <tr><td style="padding:20px;">
                      ${emailHighlight(`すべての承認者がこの依頼を承認しました。`)}
                      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
                        ${emailRow('プロジェクト', event.projectName, true)}
                        ${emailRow('動画', event.videoTitle, true)}
                        ${emailRow('バージョン', event.versionLabel)}
                        ${emailRow('承認数', String(event.approvedByCount))}
                        ${emailRow('日時', now)}
                      </table>
                      ${emailButton('バージョンを開く  →', event.url)}
                    </td></tr>
                `),
      };
    case 'approval_rejected':
      return {
        subject: `[つなぐレビュー] ${event.rejectedBy} さんが承認依頼を却下`,
        html: emailTemplate(`
                    <tr>${emailHeading('⛔', '承認が却下されました')}</tr>
                    <tr><td style="padding:20px;">
                      ${emailHighlight(`${event.rejectedBy} さんがこの依頼を却下しました。`)}
                      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
                        ${emailRow('プロジェクト', event.projectName, true)}
                        ${emailRow('動画', event.videoTitle, true)}
                        ${emailRow('バージョン', event.versionLabel)}
                        ${emailRow('却下者', event.rejectedBy)}
                        ${emailRow('日時', now)}
                      </table>
                      ${event.note ? `<div style="border-left:2px solid #7aa7ff;padding:10px 14px;margin:0 0 20px;background-color:#2f2f2f;color:#c6c6cc;font-size:13px;line-height:1.6;">${escapeHtml(truncate(event.note, 300))}</div>` : ''}
                      ${emailButton('依頼を開く  →', event.url)}
                    </td></tr>
                `),
      };
  }
}

/**
 * Generate branded HTML for test emails sent from settings page.
 */
export function testEmailHtml(): string {
  return emailTemplate(`
        <tr>${emailHeading('✓', 'テスト通知')}</tr>
        <tr><td style="padding:20px;">
          <p style="margin:0 0 8px;font-size:14px;color:${EMAIL_COLORS.text};">メール通知は正常に動作しています。</p>
          <p style="margin:0;font-size:13px;color:${EMAIL_COLORS.textSecondary};">プロジェクトで動きがあると、メールが届きます。</p>
        </td></tr>
    `);
}

// ============================================
// MAIN DISPATCH
// ============================================

/**
 * Notify the project owner about an event.
 * Looks up the owner's notification settings and dispatches to enabled channels.
 * Best-effort — never throws, logs errors.
 */
function isApprovalEvent(event: NotificationEvent): boolean {
  return (
    event.type === 'approval_requested' ||
    event.type === 'approval_action' ||
    event.type === 'approval_completed' ||
    event.type === 'approval_rejected'
  );
}

function shouldSendEvent(
  settings: {
    onNewVideo: boolean;
    onNewVersion: boolean;
    onNewComment: boolean;
    onNewReply: boolean;
    onApprovalEvents: boolean;
  },
  event: NotificationEvent
): boolean {
  if (event.type === 'new_video') return settings.onNewVideo;
  if (event.type === 'new_version') return settings.onNewVersion;
  if (event.type === 'new_comment') return settings.onNewComment;
  if (event.type === 'new_reply') return settings.onNewReply;
  if (isApprovalEvent(event)) return settings.onApprovalEvents;
  return false;
}

export async function notifyUsers(userIds: string[], event: NotificationEvent): Promise<void> {
  try {
    const dedupedUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (dedupedUserIds.length === 0) return;

    const settingsList = await db.notificationSetting.findMany({
      where: { userId: { in: dedupedUserIds } },
      include: { user: { select: { email: true } } },
    });

    await Promise.allSettled(
      settingsList.map(async (settings) => {
        if (!shouldSendEvent(settings, event)) return;

        const promises: Promise<boolean>[] = [];
        const tz = settings.timezone || 'UTC';

        const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        if (settings.telegramEnabled && telegramBotToken && settings.telegramChatId) {
          const msg = formatTelegramMessage(event, tz);
          promises.push(
            sendTelegram(
              telegramBotToken,
              settings.telegramChatId,
              msg.text,
              msg.buttonLabel,
              msg.buttonUrl
            )
          );
        }

        if (settings.emailEnabled && settings.user.email) {
          const { subject, html } = formatEmail(event, tz);
          promises.push(sendEmail(settings.user.email, subject, html));
        }

        await Promise.allSettled(promises);
      })
    );
  } catch (err) {
    logError('Notification dispatch failed:', err);
  }
}

export async function notifyProjectOwner(ownerId: string, event: NotificationEvent): Promise<void> {
  try {
    await notifyUsers([ownerId], event);
  } catch (err) {
    logError('Notification dispatch failed:', err);
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Format current date/time in the user's timezone.
 * Returns e.g. "Jan 15, 2025 at 3:45 PM"
 */
function formatNow(timezone: string): string {
  try {
    return new Date().toLocaleString('ja-JP', {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    // Invalid timezone — fall back to UTC
    return new Date().toLocaleString('ja-JP', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
  }
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
