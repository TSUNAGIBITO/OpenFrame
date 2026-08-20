import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth, checkWorkspaceAccess } from '@/lib/auth';
import { ProjectVisibility } from '@prisma/client';
import { rateLimit } from '@/lib/rate-limit';
import { buildBillingAccessWhereInput, isPaidTier } from '@/lib/billing';
import { TRIAL_PROJECT_LIMIT } from '@/lib/trial-limits';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { DEFAULT_COMMENT_TAGS } from '@/lib/comment-tags';
import { logError } from '@/lib/logger';
import { eventKey, recordEvent } from '@/lib/analytics/record';

// GET /api/projects - List all projects for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const MAX_LIMIT = 100;
    const MAX_PAGE = 1000;
    const MAX_OFFSET = 10000;

    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const workspaceId = searchParams.get('workspaceId');

    const pageRaw = pageParam === null ? 1 : Number(pageParam);
    if (!Number.isSafeInteger(pageRaw) || pageRaw < 1 || pageRaw > MAX_PAGE) {
      return apiErrors.badRequest('page が正しくありません。正の整数で指定してください。');
    }

    const limitRaw = limitParam === null ? 10 : Number(limitParam);
    if (!Number.isSafeInteger(limitRaw) || limitRaw < 1 || limitRaw > MAX_LIMIT) {
      return apiErrors.badRequest('limit が正しくありません。1〜100 の正の整数で指定してください。');
    }

    const page = pageRaw;
    const limit = limitRaw;
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip) || skip > MAX_OFFSET) {
      return apiErrors.badRequest('ページ範囲が正しくありません。オフセットは 10000 以下にしてください。');
    }

    // Build base filter: user is the project owner, a project member, or a member of the
    // workspace the project lives in. The third branch used to be dropped whenever a
    // workspaceId was supplied, so filtering by their own workspace showed a workspace
    // member an empty list while the unfiltered call returned the same project.
    const baseFilter: Record<string, unknown> = {
      OR: [
        { ownerId: session.user.id },
        { members: { some: { userId: session.user.id } } },
        { workspace: { members: { some: { userId: session.user.id } } } },
      ],
      workspace: {
        owner: buildBillingAccessWhereInput(),
      },
    };

    // Filter by workspace if provided
    if (workspaceId) {
      baseFilter.workspaceId = workspaceId;
    }

    // Get projects where user is owner OR a member
    const [projects, total] = await Promise.all([
      db.project.findMany({
        where: baseFilter,
        include: {
          owner: { select: { id: true, name: true, image: true } },
          _count: { select: { videos: true, members: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      db.project.count({
        where: baseFilter,
      }),
    ]);

    const response = successResponse({ projects }, 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });

    return withCacheControl(response, 'private, max-age=30, stale-while-revalidate=60');
  } catch (error) {
    logError('Error fetching projects:', error);
    return apiErrors.internalError('プロジェクトの取得に失敗しました');
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, 'create-project');
    if (limited) return limited;

    const session = await auth();

    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }

    const body = await request.json();
    const { name, description, visibility, workspaceId } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiErrors.badRequest('プロジェクト名を入力してください');
    }

    if (!workspaceId || typeof workspaceId !== 'string') {
      return apiErrors.badRequest(
        'ワークスペースが必要です。すべてのプロジェクトはいずれかのワークスペースに属している必要があります。'
      );
    }

    // Generate URL-friendly slug
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    // Find all existing slugs with the same prefix in a single query
    const existingProjects = await db.project.findMany({
      where: { slug: { startsWith: baseSlug } },
      select: { slug: true },
    });

    // Generate unique slug from the results
    const usedSlugs = new Set(existingProjects.map((p) => p.slug));
    let slug = baseSlug;
    let counter = 1;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Verify user has access to the workspace
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { members: { where: { userId: session.user.id } } },
    });

    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    const access = await checkWorkspaceAccess(
      { id: workspace.id, ownerId: workspace.ownerId },
      session.user.id
    );

    if (!access.canEdit) {
      return apiErrors.forbidden('プロジェクトを作成できるのはワークスペースのオーナーと管理者のみです');
    }

    // Counted against the workspace owner rather than the caller, because that is
    // the account being billed: `ownerId` on the project below is the workspace
    // owner too. A workspace admin on somebody else's trial hits the same ceiling.
    const owner = await db.user.findUnique({
      where: { id: workspace.ownerId },
      select: { subscriptionStatus: true, stripeCurrentPeriodEnd: true },
    });

    if (owner && !isPaidTier(owner)) {
      const ownedProjectCount = await db.project.count({
        where: { ownerId: workspace.ownerId },
      });

      if (ownedProjectCount >= TRIAL_PROJECT_LIMIT) {
        return apiErrors.forbidden(
          '無料トライアルでは同時に 1 つのプロジェクトのみ利用できます。既存のプロジェクトを削除するか、サブスクリプションに登録すると複数を並行して利用できます。'
        );
      }
    }

    const project = await db.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          slug,
          visibility: visibility || ProjectVisibility.PRIVATE,
          ownerId: workspace.ownerId,
          workspaceId,
        },
        include: {
          owner: { select: { id: true, name: true, image: true } },
          _count: { select: { videos: true, members: true } },
        },
      });

      await tx.commentTag.createMany({
        data: DEFAULT_COMMENT_TAGS.map((tag) => ({
          ...tag,
          projectId: createdProject.id,
        })),
        skipDuplicates: true,
      });

      return createdProject;
    });

    // Attributed to the workspace owner rather than the caller: the funnel asks
    // which account is progressing, and a team member creating a project moves
    // the owner's account, not their own.
    await recordEvent({
      name: 'PROJECT_CREATED',
      dedupeKey: eventKey('PROJECT_CREATED', project.id),
      userId: workspace.ownerId,
    });

    const response = successResponse(project, 201);
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error creating project:', error);
    return apiErrors.internalError('プロジェクトの作成に失敗しました');
  }
}
