import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import nodemailer from 'nodemailer';
import {
  brandedEmailTemplate,
  emailButton,
  emailHeading,
  emailRow,
  EMAIL_COLORS,
} from '@/lib/email-brand';
import { logError } from '@/lib/logger';

// Short window — a reset link is more sensitive than an email-verification link,
// since anyone holding it can take over the account outright.
const TOKEN_EXPIRY_HOURS = 1;

// Reuses the shared VerificationToken table (identifier/token/expires) rather than a
// dedicated model, matching lib/email-verification.ts's approach. The identifier is
// prefixed so a password-reset request never collides with (or silently invalidates)
// a live email-verification token for the same address, since both flows share one
// table keyed loosely on "identifier".
const IDENTIFIER_PREFIX = 'password-reset:';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export function isPasswordResetEnabled(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

/**
 * Generate a secure random reset token, persist only its SHA-256 digest, and return
 * the raw token (sent to the user via email, never stored). Any existing live reset
 * token for this email is deleted first (at most one live token per address).
 */
export async function createPasswordResetToken(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  const identifier = `${IDENTIFIER_PREFIX}${email}`;

  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({ data: { identifier, token: tokenHash, expires } });

  return token;
}

/**
 * Consume a password-reset token: hash the raw token, look it up, set the new
 * password, and delete the token record atomically. Returns the user's email on
 * success, or null on any failure (invalid, expired, or deleted account) — the
 * caller should show a single generic "link invalid or expired" message either way,
 * so a replayed/guessed token can't distinguish those cases.
 */
export async function consumePasswordResetToken(
  token: string,
  newPassword: string
): Promise<string | null> {
  const tokenHash = hashToken(token);
  const record = await db.verificationToken.findUnique({ where: { token: tokenHash } });

  if (!record || !record.identifier.startsWith(IDENTIFIER_PREFIX)) return null;
  if (record.expires < new Date()) {
    await db.verificationToken.delete({ where: { token: tokenHash } }).catch(() => null);
    return null;
  }

  const email = record.identifier.slice(IDENTIFIER_PREFIX.length);
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  // Clicking the reset link is proof of mailbox access — the same proof email
  // verification exists to establish. Without this, an account created before
  // email verification was required (or that never clicked its original
  // verification link) resets its password successfully here and then gets
  // silently blocked by the emailVerified check in lib/auth.ts's authorize(),
  // which surfaces as an indistinguishable "wrong password" error.
  const [updated] = await db.$transaction([
    db.user.updateMany({
      where: { email },
      data: { password: hashedPassword, emailVerified: new Date() },
    }),
    db.verificationToken.delete({ where: { token: tokenHash } }),
  ]);

  // count === 0 means the account was deleted between request and reset.
  if (updated.count === 0) return null;

  return email;
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const transporter = createTransport();
  if (!transporter) return;

  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    logError(
      'NEXTAUTH_URL is not set — cannot build a valid password reset link.',
      new Error('Set NEXTAUTH_URL to your deployment origin (e.g. https://app.example.com).')
    );
    return;
  }

  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'つなぐレビュー <info@open-frame.net>';

  const html = brandedEmailTemplate(
    `
        <tr>${emailHeading('🔑', 'パスワードの再設定')}</tr>
        <tr><td style="padding:20px;">
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${emailRow('アカウント', email, true)}
            ${emailRow('有効期限', `${TOKEN_EXPIRY_HOURS}時間`)}
          </table>
          <p style="margin:0 0 20px;font-size:14px;color:${EMAIL_COLORS.textSecondary};line-height:1.6;">
            下のボタンをクリックして、新しいパスワードを設定してください。
            心当たりのない場合は、このメールは破棄していただいて問題ありません(パスワードは変更されません)。
          </p>
          ${emailButton('パスワードを再設定する  →', resetUrl)}
        </td></tr>
        `,
    {
      footerText: `このリンクは${TOKEN_EXPIRY_HOURS}時間後に期限切れになります。`,
    }
  );

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: 'つなぐレビュー: パスワードの再設定',
      html,
    });
  } catch (err) {
    logError('Failed to send password reset email:', err);
  }
}
