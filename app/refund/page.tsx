import Link from 'next/link';
import { Video } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '返金ポリシー | つなぐレビュー',
  description: 'IPEK TECH LLC が提供する社内向け動画レビューツール「つなぐレビュー」の返金ポリシー。',
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[900px] items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold hover:text-primary transition-colors"
          >
            <Video className="h-4 w-4 text-primary" />
            つなぐレビュー
          </Link>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← ホームに戻る
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">返金ポリシー</h1>
        <p className="text-sm text-muted-foreground mb-10">最終更新日: 2026年7月30日</p>

        <div className="prose prose-sm prose-invert max-w-none space-y-8 text-sm leading-relaxed text-foreground/80">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">1. 概要</h2>
            <p>
              本返金ポリシーは、
              <strong className="text-foreground">IPEK TECH LLC</strong>
              が運営する「つなぐレビュー」の有料サブスクリプションすべてに適用されます。サブスクリプションを申し込むことで、利用者は本ポリシーに同意したものとみなされます。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">2. 無料トライアル</h2>
            <p>
              すべての新規アカウントは、有料機能をすべて利用できる{' '}
              <strong className="text-foreground">7日間の無料トライアル</strong>
              の対象です。トライアルにはクレジットカードは不要で、支払いは発生しません。申し込みの前に、この期間中に本サービスを十分にご評価いただくことを強くお勧めします。
            </p>
            <p className="mt-3">
              トライアルが自動的に有料プランへ移行することはありません。トライアル終了時点で有料機能は停止し、利用者が申し込み手続きを完了した時点で初めて課金されます。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              3. 原則として返金不可
            </h2>
            <p>
              当社は全機能を利用できる無料トライアルを提供しているため、
              <strong className="text-foreground">一度課金されたサブスクリプション料金は返金いたしません</strong>
              。これには以下が含まれます。
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>月額サブスクリプション料金</li>
              <li>年額サブスクリプション料金（未使用の月分を含む）</li>
              <li>ストレージ追加分の料金</li>
              <li>その他の有料機能・アップグレード</li>
            </ul>
            <p className="mt-3">
              サブスクリプションを解約すると以後の課金は停止しますが、当該請求期間分の返金は行いません。現在の有料期間の終了までは、引き続き本サービスをご利用いただけます。
            </p>
            <p className="mt-3">
              本返金不可の原則は、利用者による規約違反以外の理由で当社がアカウントを終了した場合、または当社が本サービスやプランを廃止した場合には適用されません。これらの場合、当社の{' '}
              <Link href="/terms" className="text-primary hover:underline">
                利用規約
              </Link>
              第13条に記載のとおり、前払いいただいた料金の未使用分を返金します。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              4. 例外 — 特別な事情
            </h2>
            <p>
              返金は、
              <strong className="text-foreground">特別な事情がある場合に限り</strong>
              、IPEK TECH LLC の裁量で検討されることがあります。対象となり<em>得る</em>事情の例は以下のとおりです。
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">長期のサービス停止:</strong> 当社のインフラに起因する、確認可能な長時間（連続72時間超）のサービス停止により、請求期間中に本サービスがまったく利用できなかった場合。
              </li>
              <li>
                <strong className="text-foreground">二重請求:</strong> 課金エラーにより、同じ請求期間について複数回課金された場合。
              </li>
              <li>
                <strong className="text-foreground">不正な取引:</strong> 利用者が承認していない課金がアカウントに対して行われ、速やかに（課金から14日以内に）当社へ報告された場合。
              </li>
            </ul>
            <p className="mt-3 border-l-2 border-border pl-4 text-muted-foreground">
              製品への不満、事業状況の変化、更新前の解約忘れ、請求期間中に本サービスを利用しなかったことなどは、特別な事情には該当せず、返金の対象となりません。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              5. 返金の申請方法
            </h2>
            <p>
              ご自身の状況が特別な事情に該当すると思われる場合は、対象の課金から{' '}
              <strong className="text-foreground">14日以内</strong>
              に以下までご連絡ください。
            </p>
            <div className="mt-3 border border-border bg-card/40 p-4 text-sm space-y-1">
              <p>
                メール:{' '}
                <a href="mailto:info@open-frame.net" className="text-primary hover:underline">
                  info@open-frame.net
                </a>
              </p>
              <p>
                件名:{' '}
                <span className="font-mono text-xs">返金申請 — [ご登録のメールアドレス]</span>
              </p>
            </div>
            <p className="mt-3">
              ご登録のメールアドレス、課金日、課金額、事情の説明を記載してください。内容を確認のうえ、5営業日以内に回答します。
            </p>
            <p className="mt-3">
              承認された返金は元の支払い方法に対して行われ、銀行やカード会社によって反映まで5〜10営業日ほどかかる場合があります。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">6. チャージバック</h2>
            <p>
              問題の解決に向けて事前に当社へご連絡いただくことなく、銀行や決済事業者へチャージバックを申請した場合、アカウントを直ちに停止することがあります。当社は、本返金ポリシーに反するチャージバックに異議を申し立てる権利を留保します。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              7. 本ポリシーの変更
            </h2>
            <p>
              当社は、本返金ポリシーをいつでも変更できるものとします。重要な変更は、本サービスまたはメールを通じてお知らせします。変更後も本サービスの利用を継続した場合、利用者は更新後のポリシーに同意したものとみなされます。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">8. お問い合わせ</h2>
            <p>請求に関するご質問や返金のお申し込みは、以下までお問い合わせください。</p>
            <div className="mt-3 border border-border bg-card/40 p-4 text-sm space-y-1">
              <p className="font-medium text-foreground">IPEK TECH LLC</p>
              <p>30 North Gould Street, Suite N</p>
              <p>Sheridan, WY 82801, United States</p>
              <p>
                メール:{' '}
                <a href="mailto:info@open-frame.net" className="text-primary hover:underline">
                  info@open-frame.net
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[900px] items-center justify-between">
          <span className="font-mono text-xs text-muted-foreground">
            © 2026 IPEK TECH LLC. All rights reserved.
          </span>
          <div className="flex gap-4">
            <Link
              href="/terms"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              利用規約
            </Link>
            <Link
              href="/privacy"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              プライバシーポリシー
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
