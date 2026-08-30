import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth, computeProjectAccess, projectAccessInclude } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { logError } from '@/lib/logger';

type RouteParams = { params: Promise<{ versionId: string }> };

// 文字起こしを生成できるプロバイダ。YouTube/Bunnyはメディア実体を
// ワーカーから取得できない(外部埋め込み/HLS)ためv1では対象外
const TRANSCRIBABLE_PROVIDERS = new Set(['r2', 'direct']);

async function loadVersionWithAccess(versionId: string, userId: string | undefined) {
  const version = await db.videoVersion.findUnique({
    where: { id: versionId },
    include: {
      video: {
        include: { project: { include: projectAccessInclude(userId) } },
      },
      transcript: true,
    },
  });
  if (!version) return null;
  const access = computeProjectAccess(version.video.project, userId);
  return { version, access };
}

// GET /api/versions/[versionId]/transcript - 文字起こしの状態と本文
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { versionId } = await params;
    if (!session?.user?.id) return apiErrors.unauthorized();

    const loaded = await loadVersionWithAccess(versionId, session.user.id);
    if (!loaded) return apiErrors.notFound('Version');
    if (!loaded.access.hasAccess) return apiErrors.forbidden('アクセスが拒否されました');

    const transcript = loaded.version.transcript;
    return withCacheControl(
      successResponse({
        transcript: transcript
          ? {
              status: transcript.status,
              language: transcript.language,
              segments: transcript.segments,
              error: transcript.error,
              updatedAt: transcript.updatedAt,
            }
          : null,
        canTranscribe: TRANSCRIBABLE_PROVIDERS.has(loaded.version.providerId),
      }),
      'private, no-store'
    );
  } catch (error) {
    logError('Error fetching transcript:', error);
    return apiErrors.internalError('文字起こしの取得に失敗しました');
  }
}

// POST /api/versions/[versionId]/transcript - 文字起こしジョブを登録(再実行も可)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'comment');
    if (limited) return limited;

    const session = await auth();
    const { versionId } = await params;
    if (!session?.user?.id) return apiErrors.unauthorized();

    const loaded = await loadVersionWithAccess(versionId, session.user.id);
    if (!loaded) return apiErrors.notFound('Version');
    if (!loaded.access.hasAccess) return apiErrors.forbidden('アクセスが拒否されました');

    if (!TRANSCRIBABLE_PROVIDERS.has(loaded.version.providerId)) {
      return apiErrors.badRequest('この動画のプロバイダは文字起こしに対応していません');
    }

    const existing = loaded.version.transcript;
    if (existing && (existing.status === 'queued' || existing.status === 'processing')) {
      return apiErrors.badRequest('文字起こしは既に実行中です');
    }

    const transcript = await db.transcript.upsert({
      where: { versionId },
      create: { versionId, status: 'queued', requestedById: session.user.id },
      update: {
        status: 'queued',
        segments: undefined,
        error: null,
        requestedById: session.user.id,
      },
    });

    return successResponse({ status: transcript.status }, 201);
  } catch (error) {
    logError('Error queueing transcript:', error);
    return apiErrors.internalError('文字起こしの開始に失敗しました');
  }
}
