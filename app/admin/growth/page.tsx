import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AT_RISK_SILENT_DAYS,
  conversionRates,
  getScoreboard,
  type FunnelRates,
} from '@/lib/analytics/scoreboard';
import { isProductAnalyticsEnabled } from '@/lib/feature-flags';
import { AlertTriangle, CreditCard, TrendingUp, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'グロース | つなぐレビュー',
  description: '獲得ファネルとリテンションのスコアボード',
};

function formatMoney(cents: number | null, currency: string) {
  if (cents === null) return '—';
  const safeCurrency = /^[a-zA-Z]{3}$/.test(currency) ? currency.toUpperCase() : 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatWeek(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : 'なし';
}

/** A percentage with the count it was computed from, because n matters here. */
function Rate({ rate, of }: { rate: number | null; of: number }) {
  if (rate === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      {Math.round(rate * 100)}%<span className="text-muted-foreground"> /{of}</span>
    </span>
  );
}

const WEEK_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'visitors', label: '訪問者' },
  { key: 'signups', label: '登録' },
  { key: 'firstVideo', label: '動画' },
  { key: 'shareLinks', label: '共有リンク' },
  { key: 'externalFeedback', label: '外部フィードバック' },
  { key: 'trials', label: 'トライアル' },
  { key: 'newPaid', label: '新規有料' },
  { key: 'canceled', label: '解約' },
  { key: 'activePaid', label: 'アクティブ有料' },
];

export default async function AdminGrowthPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    redirect('/');
  }

  if (!isProductAnalyticsEnabled()) {
    return (
      <div className="flex-1 space-y-4 px-4 md:px-8">
        <h2 className="text-3xl font-bold tracking-tight">グロース</h2>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            このデプロイでは獲得トラッキングが無効になっています。ファネルの記録を開始するには{' '}
            <code className="font-mono">OPENFRAME_ENABLE_ANALYTICS=true</code> を設定してください。
            設定するまで何も収集されず、収集されたデータもこのインスタンス自身のデータベース以外には一切送信されません。
          </CardContent>
        </Card>
      </div>
    );
  }

  const scoreboard = await getScoreboard();
  const latest = scoreboard.weeks[scoreboard.weeks.length - 1];
  const window = scoreboard.weeks.reduce(
    (sum, week) => ({
      visitors: sum.visitors + week.visitors,
      signups: sum.signups + week.signups,
      firstVideo: sum.firstVideo + week.firstVideo,
      shareLinks: sum.shareLinks + week.shareLinks,
      externalFeedback: sum.externalFeedback + week.externalFeedback,
      trials: sum.trials + week.trials,
      newPaid: sum.newPaid + week.newPaid,
    }),
    {
      visitors: 0,
      signups: 0,
      firstVideo: 0,
      shareLinks: 0,
      externalFeedback: 0,
      trials: 0,
      newPaid: 0,
    }
  );
  const overall: FunnelRates = conversionRates(window);

  return (
    <div className="flex-1 space-y-4 px-4 md:px-8">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">グロース</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">アクティブ有料</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scoreboard.currentActivePaid ?? '—'}</div>
            <p className="text-xs text-muted-foreground">Stripe より、現在の値</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMoney(scoreboard.currentMrrCents, scoreboard.currency)}
            </div>
            <p className="text-xs text-muted-foreground">Stripe より、現在の値</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">今週の訪問者</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latest?.visitors ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {latest ? `${formatWeek(latest.weekStart)} の週` : 'まだデータがありません'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">離脱リスク</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scoreboard.atRisk.length}</div>
            <p className="text-xs text-muted-foreground">
              有料、{AT_RISK_SILENT_DAYS}日以上活動なし
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">週次ファネル</CardTitle>
          <p className="text-sm text-muted-foreground">
            週は月曜日(UTC)始まりです。アクティブ有料は、開始したサブスクリプションから解約を差し引いた累積の純増数のため、上記の Stripe の数値とずれることがあります。その差がドリフトです。
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">週</th>
                {WEEK_COLUMNS.map((column) => (
                  <th key={column.key} className="py-2 pr-4 text-right font-medium">
                    {column.label}
                  </th>
                ))}
                <th className="py-2 pr-4 text-right font-medium">MRR</th>
              </tr>
            </thead>
            <tbody>
              {scoreboard.weeks.map((week) => (
                <tr key={week.weekStart.toISOString()} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{formatWeek(week.weekStart)}</td>
                  {WEEK_COLUMNS.map((column) => (
                    <td key={column.key} className="py-2 pr-4 text-right tabular-nums">
                      {week[column.key as keyof typeof week] as number}
                    </td>
                  ))}
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatMoney(week.mrrCents, scoreboard.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">どこで絞られているか</CardTitle>
          <p className="text-sm text-muted-foreground">
            {scoreboard.weeks.length}週間の期間全体における各ステップを、母数を添えて表示しています。最も低い率が改善すべきステップです。
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5 text-sm">
          <div>
            <div className="text-muted-foreground">訪問者 → 登録</div>
            <div className="text-lg font-semibold">
              <Rate rate={overall.visitorToSignup} of={window.visitors} />
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">登録 → 初回動画</div>
            <div className="text-lg font-semibold">
              <Rate rate={overall.signupToFirstVideo} of={window.signups} />
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">動画 → 共有リンク</div>
            <div className="text-lg font-semibold">
              <Rate rate={overall.firstVideoToShare} of={window.firstVideo} />
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">共有 → 外部フィードバック</div>
            <div className="text-lg font-semibold">
              <Rate rate={overall.shareToFeedback} of={window.shareLinks} />
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">トライアル → 有料</div>
            <div className="text-lg font-semibold">
              <Rate rate={overall.trialToPaid} of={window.trials} />
            </div>
          </div>
        </CardContent>
      </Card>

      {scoreboard.cohorts ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">カード先行 vs カード不要トライアル</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatDate(scoreboard.cohorts.cutover)} の前後{scoreboard.cohorts.windowDays}日間に作成されたアカウントを対象に、それぞれ登録から{' '}
              {scoreboard.cohorts.observationDays}日以内のコンバージョンを見ています。注目すべき率は登録→有料です。カード必須を外すとトライアル数が増えるため、より多くの人が支払っていてもトライアル→有料の率は下がることがあります。
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">コホート</th>
                  <th className="py-2 pr-4 font-medium">期間</th>
                  <th className="py-2 pr-4 text-right font-medium">登録</th>
                  <th className="py-2 pr-4 text-right font-medium">トライアル</th>
                  <th className="py-2 pr-4 text-right font-medium">有料</th>
                  <th className="py-2 pr-4 text-right font-medium">登録 → 有料</th>
                  <th className="py-2 pr-4 text-right font-medium">トライアル → 有料</th>
                </tr>
              </thead>
              <tbody>
                {scoreboard.cohorts.rows.map((row) => (
                  <tr key={row.cohort} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      {row.cohort === 'CARDLESS' ? 'カード不要' : 'カード先行'}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {formatDate(row.windowStart)} 〜 {formatDate(row.windowEnd)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.signups}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.trials}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.paid}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      <Rate
                        rate={row.signups > 0 ? row.paid / row.signups : null}
                        of={row.signups}
                      />
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      <Rate rate={row.trials > 0 ? row.paid / row.trials : null} of={row.trials} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {scoreboard.cohorts.windowDays === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                まだ比較できるデータがありません。最初のカード不要登録が{' '}
                {scoreboard.cohorts.observationDays}日間の観測期間を終えるのは、切り替えから{scoreboard.cohorts.observationDays}{' '}
                日後です。
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">流入元別</CardTitle>
          <p className="text-sm text-muted-foreground">
            1週間ではなく直近{scoreboard.channelWindowDays}日間の集計です。この規模では流入元ごとの週次セルが1桁にとどまり、3回の訪問から計算した割合は300回から計算したものとまったく同じ確度に見えてしまうためです。
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">流入元</th>
                <th className="py-2 pr-4 text-right font-medium">訪問者</th>
                <th className="py-2 pr-4 text-right font-medium">登録</th>
                <th className="py-2 pr-4 text-right font-medium">トライアル</th>
                <th className="py-2 pr-4 text-right font-medium">有料</th>
                <th className="py-2 pr-4 text-right font-medium">訪問者 → 登録</th>
              </tr>
            </thead>
            <tbody>
              {scoreboard.channels.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-muted-foreground">
                    この期間にはまだ記録がありません。
                  </td>
                </tr>
              )}
              {scoreboard.channels.map((row) => (
                <tr key={row.channel} className="border-b last:border-0">
                  <td className="py-2 pr-4">{row.channel.toLowerCase()}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.visitors}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.signups}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.trials}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.paid}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    <Rate
                      rate={row.visitors > 0 ? row.signups / row.visitors : null}
                      of={row.visitors}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">有料アカウント</CardTitle>
          <p className="text-sm text-muted-foreground">
            バリューイベントとは、動画・共有リンク・外部フィードバック・承認・プロジェクトを指します。離脱リスクと表示された行は、{AT_RISK_SILENT_DAYS}日間これらが一件も発生していません。
            {scoreboard.paidAccountsTruncated && (
              <>
                {' '}
                最も静かな{scoreboard.paidAccountLimit}件のみを表示しています。実際にはこの表に表示されているよりも多くの有料アカウントがあります。
              </>
            )}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">アカウント</th>
                <th className="py-2 pr-4 font-medium">ステータス</th>
                <th className="py-2 pr-4 font-medium">流入元</th>
                <th className="py-2 pr-4 text-right font-medium">7日</th>
                <th className="py-2 pr-4 text-right font-medium">30日</th>
                <th className="py-2 pr-4 font-medium">最終活動</th>
              </tr>
            </thead>
            <tbody>
              {scoreboard.paidAccounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-muted-foreground">
                    アクティブまたはトライアル中のアカウントはありません。
                  </td>
                </tr>
              )}
              {scoreboard.paidAccounts.map((account) => {
                const atRisk = scoreboard.atRisk.some((row) => row.userId === account.userId);
                return (
                  <tr key={account.userId} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      {account.name || account.email || account.userId}
                      {atRisk && (
                        <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                          離脱リスク
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {account.status.toLowerCase()}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {account.channel?.toLowerCase() ?? '—'}
                      {account.selfReported && account.selfReported !== account.channel && (
                        <span className="text-xs">
                          {' '}
                          (自己申告: {account.selfReported.toLowerCase()})
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{account.valueEvents7}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{account.valueEvents30}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {formatDate(account.lastValueEventAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
