import { NextRequest } from 'next/server';
import { auth, checkProjectAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  buildCommentsCsv,
  buildCommentsPdf,
  buildExportFileBaseName,
  flattenCommentsForExport,
} from '@/lib/comment-export';
import { apiErrors, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

type RouteParams = { params: Promise<{ versionId: string }> };
const MAX_EXPORT_COMMENTS = 5000;

// GET /api/versions/[versionId]/comments/export?format=csv|pdf|markers&includeResolved=true|false
// markers: TsunaguEditor等の編集ソフトへタイムラインマーカーとして取り込むためのJSON
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'comment-export');
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) {
      return apiErrors.unauthorized('エクスポートには認証が必要です');
    }

    const { versionId } = await params;
    const { searchParams } = new URL(request.url);

    const format = (searchParams.get('format') || 'csv').toLowerCase();
    if (format !== 'csv' && format !== 'pdf' && format !== 'markers') {
      return apiErrors.badRequest(
        'フォーマットが正しくありません。"csv"・"pdf"・"markers" のいずれかを指定してください'
      );
    }

    const includeResolved = searchParams.get('includeResolved') !== 'false';

    const version = await db.videoVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        versionNumber: true,
        versionLabel: true,
        video: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                ownerId: true,
                workspaceId: true,
                visibility: true,
              },
            },
          },
        },
      },
    });

    if (!version) {
      return apiErrors.notFound('Version');
    }

    const project = version.video.project;
    const access = await checkProjectAccess(project, session.user.id);

    if (!access.hasAccess) {
      return apiErrors.notFound('Version');
    }

    const totalComments = await db.comment.count({
      where: {
        versionId,
        ...(includeResolved ? {} : { isResolved: false }),
      },
    });
    if (totalComments > MAX_EXPORT_COMMENTS) {
      return apiErrors.badRequest(
        `エクスポートするコメントが多すぎます(${totalComments} 件)。エクスポートできるのは最大 ${MAX_EXPORT_COMMENTS} 件です。`
      );
    }

    const comments = await db.comment.findMany({
      where: {
        versionId,
        parentId: null,
        ...(includeResolved ? {} : { isResolved: false }),
      },
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        parentId: true,
        content: true,
        timestamp: true,
        timestampEnd: true,
        isResolved: true,
        voiceUrl: true,
        voiceDuration: true,
        imageUrl: true,
        annotationData: true,
        createdAt: true,
        author: { select: { name: true } },
        guestName: true,
        tag: { select: { name: true, color: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            parentId: true,
            content: true,
            timestamp: true,
            timestampEnd: true,
            isResolved: true,
            voiceUrl: true,
            voiceDuration: true,
            imageUrl: true,
            annotationData: true,
            createdAt: true,
            author: { select: { name: true } },
            guestName: true,
            tag: { select: { name: true, color: true } },
          },
        },
      },
    });

    const rows = flattenCommentsForExport(comments);
    const fileBaseName = buildExportFileBaseName(version.video.title, version.versionNumber);
    const versionMeta = {
      videoTitle: version.video.title,
      versionNumber: version.versionNumber,
      versionLabel: version.versionLabel,
    };

    if (format === 'markers') {
      // 親コメントのみをマーカー化(返信は本文の文脈なので対象外)。
      // TsunaguEditorの「レビューコメント取り込み」が読む想定の安定フォーマット
      const markers = comments.map((comment) => ({
        time: comment.timestamp,
        timeEnd: comment.timestampEnd ?? null,
        text:
          (comment.content ?? '')
            .replace(/@\[(.+?)\]\((?:asset|user):[\w-]+\)/gi, '@$1')
            .trim() ||
          (comment.voiceUrl ? '(音声コメント)' : comment.imageUrl ? '(画像コメント)' : '(注釈)'),
        author: comment.author?.name || comment.guestName || '匿名',
        tag: comment.tag?.name ?? null,
        color: comment.tag?.color ?? null,
        resolved: comment.isResolved,
      }));

      const payload = {
        format: 'tsunagu-review-markers',
        formatVersion: 1,
        video: {
          title: version.video.title,
          versionNumber: version.versionNumber,
          versionLabel: version.versionLabel,
          reviewUrl: `${process.env.NEXTAUTH_URL || ''}/projects/${project.id}/videos/${version.video.id}`,
        },
        exportedAt: new Date().toISOString(),
        markers,
      };

      const response = new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileBaseName}.markers.json"`,
        },
      });
      return withCacheControl(response, 'private, no-store');
    }

    if (format === 'csv') {
      const csv = buildCommentsCsv(rows, versionMeta);
      const response = new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileBaseName}.csv"`,
        },
      });

      return withCacheControl(response, 'private, no-store');
    }

    const pdf = buildCommentsPdf(rows, versionMeta);
    const pdfBytes = Uint8Array.from(pdf);
    const response = new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileBaseName}.pdf"`,
      },
    });

    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error exporting comments:', error);
    return apiErrors.internalError('コメントのエクスポートに失敗しました');
  }
}
