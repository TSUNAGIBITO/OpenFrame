import Link from 'next/link';
import { Video } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | つなぐレビュー',
  description: 'IPEK TECH LLC が提供する社内向け動画レビューツール「つなぐレビュー」のプライバシーポリシー。',
};

export default function PrivacyPolicyPage() {
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
        <h1 className="text-3xl font-semibold tracking-tight mb-2">プライバシーポリシー</h1>
        <p className="text-sm text-muted-foreground mb-10">最終更新日: 2026年4月10日</p>

        <div className="prose prose-sm prose-invert max-w-none space-y-8 text-sm leading-relaxed text-foreground/80">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">1. はじめに</h2>
            <p>
              <strong className="text-foreground">IPEK TECH LLC</strong>（以下「当社」）は、社内向け動画レビューツール「つなぐレビュー」（以下「本サービス」）を運営しています。本プライバシーポリシーは、利用者が本サービスを利用する際に当社が情報をどのように収集・利用・共有・保護するかを説明するものです。
            </p>
            <p className="mt-3">
              本サービスを利用することで、利用者は本プライバシーポリシーに従った情報の収集・利用に同意するものとします。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              2. 収集する情報
            </h2>

            <h3 className="text-sm font-semibold text-foreground mb-2 mt-4">
              2.1 利用者が提供する情報
            </h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">アカウント情報:</strong> 登録時の氏名、メールアドレス、パスワード。
              </li>
              <li>
                <strong className="text-foreground">プロフィール情報:</strong> アバター画像、表示名。
              </li>
              <li>
                <strong className="text-foreground">請求情報:</strong> Stripeを通じて安全に処理される支払い情報。カード番号の全桁を当社のサーバーに保存することはありません。
              </li>
              <li>
                <strong className="text-foreground">利用者コンテンツ:</strong> 本サービス内でアップロード・作成する動画、コメント、注釈などのコンテンツ。
              </li>
              <li>
                <strong className="text-foreground">連絡内容:</strong> メールやフィードバックフォームから当社に送信されるメッセージ。
              </li>
            </ul>

            <h3 className="text-sm font-semibold text-foreground mb-2 mt-4">
              2.2 自動的に収集される情報
            </h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">利用データ:</strong> 閲覧したページ、使用した機能、本サービス内での操作、タイムスタンプ。
              </li>
              <li>
                <strong className="text-foreground">デバイス・ブラウザ情報:</strong> IPアドレス、ブラウザの種類、OS、参照元URL。
              </li>
              <li>
                <strong className="text-foreground">Cookieおよび類似技術:</strong>{' '}
                認証と設定の保存のためのセッションCookie。第三者の広告Cookieは使用しません。
              </li>
            </ul>

            <h3 className="text-sm font-semibold text-foreground mb-2 mt-4">
              2.3 第三者から取得する情報
            </h3>
            <p>
              第三者のOAuthプロバイダー（GoogleまたはGitHub）でサインインした場合、当該プロバイダーでの設定に応じて、基本的なプロフィール情報（氏名、メールアドレス、アバター）を取得します。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              3. 情報の利用目的
            </h2>
            <p>当社は、収集した情報を以下の目的で利用します。</p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>本サービスの提供、運用、改善のため。</li>
              <li>決済の処理およびサブスクリプションの管理のため。</li>
              <li>
                取引に関する通知メール（アカウントの確認、パスワードのリセット、請求に関する通知等）の送信のため。
              </li>
              <li>お問い合わせやサポート依頼への対応のため。</li>
              <li>製品の更新情報やお知らせの送信のため（いつでも配信停止できます）。</li>
              <li>利用状況の監視・分析による本サービスの改善のため。</li>
              <li>不正または不適切な行為の検知・調査・防止のため。</li>
              <li>法令上の義務を遵守するため。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              4. 情報の共有
            </h2>
            <p>当社は、利用者の個人情報を販売しません。以下の場合に情報を共有することがあります。</p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">サービス提供事業者:</strong> 本サービスの運用を支援する第三者（クラウドストレージ、動画配信、Stripeによる決済処理など）。これらの事業者は、契約上、利用者のデータを保護する義務を負います。
              </li>
              <li>
                <strong className="text-foreground">他の利用者:</strong> 利用者が共有リンクで共有することを選んだ利用者コンテンツは、設定した権限に応じてリンクの受信者がアクセスできます。
              </li>
              <li>
                <strong className="text-foreground">法令上の要請:</strong> 法令、裁判所の命令、政府機関の要請により必要な場合、または当社その他の者の権利や安全を守るために、情報を開示することがあります。
              </li>
              <li>
                <strong className="text-foreground">事業譲渡:</strong> 合併、買収、資産の譲渡が行われる場合、その取引の一環として利用者の情報が移転されることがあります。
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">5. データの保持</h2>
            <p>
              当社は、アカウントが有効である間、または本サービスの提供に必要な間、利用者の個人情報を保持します。アカウントを削除した場合、当社は合理的な期間内に個人情報を削除または匿名化します。ただし、法令・規制上の理由や正当な事業上の目的（請求に関する紛争など）で保持が必要な場合を除きます。
            </p>
            <p className="mt-3">
              利用者が本サービスから削除した利用者コンテンツは、稼働中のストレージから削除されます。ただし、バックアップ用の複製は消去されるまで一定期間残ることがあります。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">6. セキュリティ</h2>
            <p>
              当社は、通信の暗号化（TLS）やアクセス制御など、業界標準のセキュリティ対策を講じて利用者の情報を保護します。ただし、インターネット上の送信や電子的な保存に完全な安全性はなく、当社は絶対的な安全性を保証できません。強固で固有のパスワードを使用し、アカウントの認証情報を秘密に保つことをお勧めします。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              7. 利用者の権利と選択
            </h2>
            <p>
              居住地域によっては、利用者は自身の個人情報について以下の権利を有する場合があります。
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">アクセス・ポータビリティ:</strong> 当社が保有する利用者のデータの写しを請求すること。
              </li>
              <li>
                <strong className="text-foreground">訂正:</strong> 不正確なデータの訂正を請求すること。
              </li>
              <li>
                <strong className="text-foreground">削除:</strong> 個人情報の削除を請求すること（法令上の保持義務に従います）。
              </li>
              <li>
                <strong className="text-foreground">配信停止:</strong> メール内の配信停止リンク、または当社への連絡により、いつでもマーケティングメールの受信を停止すること。
              </li>
            </ul>
            <p className="mt-3">
              これらの権利を行使するには、{' '}
              <a href="mailto:info@open-frame.net" className="text-primary hover:underline">
                info@open-frame.net
              </a>{' '}
              までご連絡ください。合理的な期間内に対応します。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">8. Cookie</h2>
            <p>
              当社は、本サービスの運用に不可欠なCookie（認証セッション、CSRF対策）と、本サービスの利用状況を把握するための限定的な分析Cookieを使用します。第三者の広告Cookieやトラッキングピクセルは使用しません。ブラウザの設定でCookieを無効にできますが、その場合、本サービスの一部が利用できなくなることがあります。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              9. 未成年者のプライバシー
            </h2>
            <p>
              本サービスは18歳未満の方を対象としていません。当社は、未成年者から意図的に個人情報を収集することはありません。誤って未成年者の情報を収集したと思われる場合は、直ちに{' '}
              <a href="mailto:info@open-frame.net" className="text-primary hover:underline">
                info@open-frame.net
              </a>{' '}
              までご連絡ください。当該情報を削除するための措置を講じます。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              10. 情報の国際的な移転
            </h2>
            <p>
              利用者の情報は、当社のサービス提供事業者が運営する米国その他の国で保存・処理されることがあります。本サービスを利用することで、利用者は、居住国とは異なるデータ保護法が適用される可能性のあるこれらの国への情報の移転に同意するものとします。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              11. 第三者のサービス
            </h2>
            <p>
              本サービスは、第三者のサービス（GitHub、Google、Stripe、Bunny CDN など）と連携またはリンクする場合があります。本プライバシーポリシーはこれらのサービスには適用されません。各サービスのプライバシーポリシーをご確認ください。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              12. 本ポリシーの変更
            </h2>
            <p>
              当社は、本プライバシーポリシーを随時更新することがあります。重要な変更を行う場合は、本ページに更新後のポリシーを掲載し、「最終更新日」を更新することで通知します。変更後も本サービスの利用を継続した場合、利用者は更新後のポリシーに同意したものとみなされます。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">13. お問い合わせ</h2>
            <p>
              本プライバシーポリシーや当社のデータの取り扱いに関するご質問・ご懸念は、以下までお問い合わせください。
            </p>
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
              href="/refund"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              返金ポリシー
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
