import { auth } from '@/lib/auth';
import { apiErrors, successResponse } from '@/lib/api-response';
import { refreshR2StorageSnapshot } from '@/lib/admin-stats';
import { logError } from '@/lib/logger';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return apiErrors.forbidden('管理者権限が必要です');
    }

    const refreshedAt = await refreshR2StorageSnapshot();

    return successResponse({
      ok: true,
      refreshedAt,
    });
  } catch (error) {
    logError('Error refreshing R2 admin stats cache:', error);
    return apiErrors.internalError('R2 統計の更新に失敗しました');
  }
}
