// tsunagu-review-markers v1 payload builder — shared by the logged-in comment
// export (format=markers) and the share-token integration endpoint so the two
// routes can never drift apart. TsunaguEditor's「レビューマーカーを読み込み」and
// pull_review_markers both parse this shape.

export interface MarkerSourceComment {
  id: string;
  content: string | null;
  timestamp: number;
  timestampEnd: number | null;
  isResolved: boolean;
  voiceUrl: string | null;
  imageUrl: string | null;
  author: { name: string | null } | null;
  guestName: string | null;
  tag: { name: string; color: string | null } | null;
}

export interface MarkerExportMeta {
  videoTitle: string | null;
  videoId: string;
  projectId: string;
  versionNumber: number;
  versionLabel: string | null;
}

export function buildReviewMarkersPayload(
  comments: readonly MarkerSourceComment[],
  meta: MarkerExportMeta,
) {
  // 親コメントのみをマーカー化(返信は本文の文脈なので対象外)
  const markers = comments.map((comment) => ({
    // コメント ID。TsunaguEditor が /api/integration/review-replies で返信を
    // 付ける先。formatVersion 1 のまま追加(additive)。
    id: comment.id,
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

  return {
    format: 'tsunagu-review-markers',
    formatVersion: 1,
    video: {
      title: meta.videoTitle,
      versionNumber: meta.versionNumber,
      versionLabel: meta.versionLabel,
      reviewUrl: `${process.env.NEXTAUTH_URL || ''}/projects/${meta.projectId}/videos/${meta.videoId}`,
    },
    exportedAt: new Date().toISOString(),
    markers,
  };
}

/** Prisma select shared by both marker routes (parent comments only). */
export const MARKER_COMMENT_SELECT = {
  id: true,
  content: true,
  timestamp: true,
  timestampEnd: true,
  isResolved: true,
  voiceUrl: true,
  imageUrl: true,
  author: { select: { name: true } },
  guestName: true,
  tag: { select: { name: true, color: true } },
} as const;
