import Link from 'next/link';
import { Video } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '利用規約 | つなぐレビュー',
  description: 'IPEK TECH LLC が提供する社内向け動画レビューツール「つなぐレビュー」の利用規約。',
};

export default function TermsOfServicePage() {
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
        <h1 className="text-3xl font-semibold tracking-tight mb-2">利用規約</h1>
        <p className="text-sm text-muted-foreground mb-10">最終更新日: 2026年7月30日</p>

        <div className="prose prose-sm prose-invert max-w-none space-y-8 text-sm leading-relaxed text-foreground/80">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">1. 規約への同意</h2>
            <p>
              本利用規約（以下「本規約」）は、
              <strong className="text-foreground">IPEK TECH LLC</strong>
              （以下「当社」）が提供する社内向け動画レビューツール「つなぐレビュー」（以下「本サービス」）の利用条件を定めるものです。
            </p>
            <p className="mt-3">
              本サービスを利用する方（以下「利用者」）は、本規約に同意したうえで本サービスを利用するものとします。本規約に同意いただけない場合、本サービスをご利用いただくことはできません。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              2. 本サービスの内容
            </h2>
            <p>
              本サービスは、動画プロジェクトについて、タイムスタンプ付きコメント・注釈・バージョン管理・承認フローを通じてレビューと承認を行うための社内ツールです。当社の業務に関わるメンバーおよび当社が招待した関係者が利用します。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">3. 利用資格</h2>
            <p>
              本サービスは、当社のメンバーおよび当社が明示的に招待した関係者のみが利用できます。利用者は、所属する組織を本規約に拘束する権限を有していることを表明するものとします。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">4. アカウント</h2>
            <p>
              本サービスの利用にはアカウント登録が必要です。利用者は、登録時に正確かつ最新の情報を提供し、常に最新の状態に保つものとします。アカウントの認証情報の管理は利用者の責任とし、当該アカウントで行われたすべての操作について利用者が責任を負います。
            </p>
            <p className="mt-3">
              アカウントの不正利用に気づいた場合は、直ちに{' '}
              <a href="mailto:info@open-frame.net" className="text-primary hover:underline">
                info@open-frame.net
              </a>{' '}
              までご連絡ください。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              5. サブスクリプションと無料トライアル
            </h2>
            <p>
              本サービスの一部の機能は、有料のサブスクリプションを必要とします。新規アカウントには
              <strong className="text-foreground">7日間の無料トライアル</strong>
              が付与されます。トライアルはメールアドレスの確認後に開始され、クレジットカードは不要です。トライアルが自動的に有料プランへ移行することはなく、期間中に課金されることもありません。トライアル終了時点で有料機能は停止し、利用者が申し込み手続きを完了した時点で初めて課金されます。
            </p>
            <p className="mt-3">
              サブスクリプション料金は、選択したプランに応じて月額または年額で前払い制により請求されます。すべての料金は、当社の{' '}
              <Link href="/refund" className="text-primary hover:underline">
                返金ポリシー
              </Link>
              に明記されている場合を除き、返金されません。
            </p>
            <p className="mt-3">
              当社は、合理的な事前の通知をもって、サブスクリプションの料金を変更する権利を留保します。料金変更後も本サービスの利用を継続した場合、利用者は新しい料金に同意したものとみなされます。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">6. 利用者コンテンツ</h2>
            <p>
              利用者が本サービスにアップロード・作成したコンテンツ（以下「利用者コンテンツ」）の権利は利用者に帰属します。当社は、本サービスを提供する目的の範囲でのみ、利用者コンテンツを保存・処理・表示します。
            </p>
            <p className="mt-3">
              利用者は、利用者コンテンツについて必要な権利をすべて有していることを表明し、(a) 第三者の知的財産権を侵害するもの、(b) 違法・中傷的・有害なもの、(c) マルウェアや悪意あるコードを含むもの、(d) 適用される法令に違反するものをアップロードしないことに同意します。
            </p>
            <p className="mt-3">
              当社は、利用者コンテンツが本規約に違反していると合理的に判断した場合、当該コンテンツを削除またはアクセスを停止することがあります。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">7. 禁止事項</h2>
            <p>利用者は、以下の行為を行ってはなりません。</p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>適用される法令に違反する態様で本サービスを利用すること。</li>
              <li>
                本サービスまたは関連システムへの不正アクセスを試みること。
              </li>
              <li>本サービスの完全性や動作を妨害・阻害すること。</li>
              <li>
                本サービスのリバースエンジニアリング、逆コンパイル、ソースコードの抽出を試みること。
              </li>
              <li>本サービスを通じてスパムや迷惑通信を送信すること。</li>
              <li>
                許可なく個人を特定できる情報を収集すること。
              </li>
              <li>
                当社の書面による許可なく、本サービスへのアクセスを再販・再許諾すること。
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              8. 知的財産権
            </h2>
            <p>
              利用者コンテンツを除き、本サービスおよびそのすべてのコンテンツ・機能（ソフトウェア、テキスト、グラフィック、ロゴ、デザインを含みますがこれらに限りません）に関する権利は、当社または当社にライセンスを許諾した者に帰属し、適用される知的財産権法によって保護されます。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">9. プライバシー</h2>
            <p>
              本サービスの利用には、当社の{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                プライバシーポリシー
              </Link>
              も適用され、本規約の一部として組み込まれます。本サービスを利用することで、利用者は同ポリシーに記載された情報の取り扱いに同意するものとします。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">10. 免責事項</h2>
            <p>
              本サービスは「現状有姿」および「提供可能な範囲」で提供され、商品性、特定目的への適合性、非侵害性を含むいかなる明示または黙示の保証も行いません。当社は、本サービスが中断されないこと、エラーがないこと、ウイルスその他の有害な要素が含まれないことを保証しません。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              11. 責任の制限
            </h2>
            <p>
              適用される法令が認める最大限の範囲において、当社は、本サービスの利用または利用不能から生じる間接的・付随的・特別・結果的・懲罰的損害（逸失利益、データの喪失、事業の中断を含む）について、その可能性を事前に通知されていた場合であっても、一切責任を負いません。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">12. 補償</h2>
            <p>
              利用者は、(a) 本サービスの利用、(b) 利用者コンテンツ、(c) 本規約の違反、(d) 第三者の権利の侵害から生じる請求・損害・損失・責任・費用（合理的な弁護士費用を含む）について、当社を防御し、補償し、損害を与えないものとします。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              13. 利用停止および終了
            </h2>
            <p>当社は、以下の場合に利用者のアクセスを停止または終了することがあります。</p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>
                利用者が本規約（第7条の禁止事項を含む）に重大な違反をし、当社の書面による通知から10日以内に是正しない場合。同一の義務に対する繰り返しの違反には是正期間を設けません。
              </li>
              <li>
                利用者の利用が違法であるか、第三者の権利を侵害するか、当社や他の利用者を法的責任やセキュリティ上のリスクにさらす場合。この場合、当社は事前通知なく直ちに対応することがあります。
              </li>
              <li>法令または権限を有する当局の要請により必要となった場合。</li>
            </ul>
            <p className="mt-3">
              利用者は、いつでもアカウント設定または{' '}
              <a href="mailto:info@open-frame.net" className="text-primary hover:underline">
                info@open-frame.net
              </a>{' '}
              への連絡によりアカウントを解約できます。終了後、本サービスへのアクセス権は直ちに失われます。その性質上終了後も存続すべき条項（第8条、第10条、第11条、第12条、第14条、第15条を含む）は、終了後も有効に存続します。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">
              14. 準拠法および紛争解決
            </h2>
            <p>
              本規約は日本法に準拠し、これに従って解釈されます。本規約または本サービスに関して生じる紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">15. 規約の変更</h2>
            <p>
              当社は、本規約をいつでも変更できるものとします。重要な変更を行う場合は、本ページに更新後の規約を掲載し、「最終更新日」を更新することで通知します。変更後も本サービスの利用を継続した場合、利用者は新しい規約に同意したものとみなされます。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-3">16. お問い合わせ</h2>
            <p>本規約に関するご質問は、以下までお問い合わせください。</p>
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
              href="/privacy"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              プライバシーポリシー
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
