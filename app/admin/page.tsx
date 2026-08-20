import { Metadata } from 'next';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { isBunnyUploadsFeatureEnabled, isStripeBillingEnabled } from '@/lib/feature-flags';
import { redirect } from 'next/navigation';
import {
  getCachedBunnyStorageStats,
  getCachedTotalStorage,
  getCachedStripeStats,
} from '@/lib/admin-stats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshR2StatsButton } from '@/components/admin/refresh-r2-stats-button';
import {
  Users,
  Folder,
  Video,
  MessageSquare,
  Mic,
  HardDrive,
  Image as ImageIcon,
  Film,
  MessageSquareQuote,
  Star,
  CreditCard,
  TrendingUp,
  UserCheck,
  AlertCircle,
  UserX,
} from 'lucide-react';

export const metadata: Metadata = {
  title: '管理ダッシュボード | つなぐレビュー',
  description: '管理者向けの概要ダッシュボード',
};

function formatBytes(bytes: number, decimals = 2) {
  if (bytes < 0) return '取得エラー';
  if (!+bytes) return '0 Bytes';
  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatMrr(cents: number, currency: string) {
  const safeCurrency = /^[a-zA-Z]{3}$/.test(currency) ? currency.toUpperCase() : 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    redirect('/');
  }

  const userFeedbackDelegate = (
    db as unknown as {
      userFeedback?: { count: (args?: unknown) => Promise<number> };
    }
  ).userFeedback;

  // 1. Database Stats
  const [
    totalUsers,
    totalProjects,
    totalVideos,
    totalComments,
    totalVoiceComments,
    totalImageComments,
  ] = await Promise.all([
    db.user.count(),
    db.project.count(),
    db.video.count(),
    db.comment.count(),
    db.comment.count({
      where: { voiceUrl: { not: null } },
    }),
    db.comment.count({
      where: { images: { some: {} } },
    }),
  ]);

  let totalFeedback = 0;
  let totalReviews = 0;
  if (userFeedbackDelegate) {
    try {
      [totalFeedback, totalReviews] = await Promise.all([
        userFeedbackDelegate.count({
          where: { type: 'FEEDBACK' },
        }),
        userFeedbackDelegate.count({
          where: { type: 'REVIEW' },
        }),
      ]);
    } catch (error) {
      console.error('Failed to fetch feedback stats:', error);
    }
  }

  // 2. Storage Stats (Cached)
  const [totalStorageBytes, bunnyStorageStats, stripeStats] = await Promise.all([
    getCachedTotalStorage(),
    getCachedBunnyStorageStats(),
    getCachedStripeStats(),
  ]);

  return (
    <div className="flex-1 space-y-4 px-4 md:px-8">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">ダッシュボード概要</h2>
        <RefreshR2StatsButton />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総ユーザー数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ワークスペース・プロジェクト</CardTitle>
            <Folder className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProjects}</div>
            <p className="text-xs text-muted-foreground">プラットフォーム上のアクティブなプロジェクト総数</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">アクティブな動画</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVideos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総コメント数</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalComments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">音声録音</CardTitle>
            <Mic className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVoiceComments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">画像添付</CardTitle>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalImageComments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">フィードバック投稿数</CardTitle>
            <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFeedback}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">レビュー投稿数</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalReviews}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cloudflare R2 ストレージ</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(totalStorageBytes)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bunny Stream ストレージ</CardTitle>
            <Film className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isBunnyUploadsFeatureEnabled()
                ? formatBytes(bunnyStorageStats.totalBytes)
                : '無効'}
            </div>
          </CardContent>
        </Card>
      </div>

      {isStripeBillingEnabled() && stripeStats && (
        <>
          <h3 className="text-xl font-semibold tracking-tight pt-2">請求・売上</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">月次経常収益(MRR)</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatMrr(stripeStats.mrrCents, stripeStats.currency)}
                </div>
                <p className="text-xs text-muted-foreground">アクティブなサブスクリプションに基づく</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">有料会員数</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stripeStats.activeSubscribers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">トライアル中</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stripeStats.trialingUsers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">無料ユーザー</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stripeStats.freeUsers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">支払い遅延</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stripeStats.pastDueUsers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">解約済み</CardTitle>
                <UserX className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stripeStats.canceledUsers}</div>
              </CardContent>
            </Card>
            {/* UNPAID, INCOMPLETE and INCOMPLETE_EXPIRED, which belonged to none of the
                buckets above and so were counted nowhere. */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">未払い・未完了</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stripeStats.otherStatusUsers}</div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
