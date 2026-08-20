'use client';

import Image from 'next/image';
import Link from 'next/link';
import { CtaLink } from '@/components/marketing/cta-link';
import { ThemeToggle } from '@/components/theme-toggle';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import {
  Video,
  MoveRight,
  Play,
  Mic,
  PenTool,
  Keyboard,
  BellRing,
  FolderOpen,
  FileDown,
  History,
  Smartphone,
  Link as LinkIcon,
  MessageSquare,
  ArrowDown,
  CheckCircle,
  Upload,
  Share2,
  Check,
} from 'lucide-react';

interface LandingPageProps {
  isLoggedIn: boolean;
}

const controlButtonClass =
  'group relative isolate inline-flex h-8 items-center justify-center overflow-hidden border border-border bg-background px-2.5 text-[11px] font-medium text-foreground transition-colors duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:h-9 sm:px-4 sm:text-xs';

const coreWorkflowFeatures = [
  {
    title: 'バージョン比較',
    description: '任意の2バージョンを同じタイムライン上で並べて比較できます。',
    icon: History,
  },
  {
    title: '素材管理',
    description: '画像や参考動画をカットごとにきちんとグループ化して保持します。',
    icon: FolderOpen,
  },
  {
    title: 'バージョン履歴',
    description: '無制限のバージョン管理。V1とV10を行き来しても位置を見失いません。',
    icon: History,
  },
  {
    title: '承認フロー',
    description: '担当者に確認・承認を割り当て、「承認済み」の状態を明確にできます。',
    icon: CheckCircle,
  },
];

const workflowAcceleratorFeatures = [
  {
    title: 'キーボードショートカット',
    description: 'J・K・L・Space・Mなど、プロの編集ワークフローに合わせた操作。',
    icon: Keyboard,
  },
  {
    title: 'PDF/CSVエクスポート',
    description: '動画コメントをワンクリックでフィードバックレポートに変換。',
    icon: FileDown,
  },
  {
    title: 'リアルタイム通知',
    description: 'コメントが付いた瞬間に通知を受け取れます。',
    icon: BellRing,
  },
  {
    title: 'モバイル最適化',
    description: '外出先でもタッチ操作でスムーズにレビューできます。',
    icon: Smartphone,
  },
];

export function LandingPage({ isLoggedIn }: LandingPageProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const navbarRef = useRef<HTMLElement | null>(null);
  const hostedCtaHref = isLoggedIn ? '/dashboard' : '/register';
  const hostedCtaLabel = isLoggedIn ? 'ダッシュボードを開く' : '招待コードではじめる';

  useEffect(() => {
    const cleanupHandlers: Array<() => void> = [];

    const ctx = gsap.context(() => {
      // General Reveal Animations
      gsap.from('[data-hero-copy]', {
        y: 40,
        opacity: 0,
        duration: 1,
        stagger: 0.15,
        ease: 'power4.out',
      });

      // Voice Notes Waveform Animation
      const waveformBars = gsap.utils.toArray<HTMLElement>('.voice-bar');
      waveformBars.forEach((bar, index) => {
        gsap.set(bar, { transformOrigin: 'center bottom' });
        gsap.to(bar, {
          scaleY: gsap.utils.random(0.3, 1.5),
          duration: gsap.utils.random(0.4, 0.8),
          repeat: -1,
          yoyo: true,
          delay: index * 0.05,
          ease: 'power2.inOut',
        });
      });

      // Navbar Scroll Effect
      const nav = navbarRef.current;
      if (nav) {
        const updateNavbar = () => {
          const hasScrolled = window.scrollY > 20;
          gsap.to(nav, {
            backgroundColor: hasScrolled
              ? 'color-mix(in oklab, var(--background) 85%, transparent)'
              : 'transparent',
            backdropFilter: hasScrolled ? 'blur(16px)' : 'blur(0px)',
            borderBottomColor: hasScrolled ? 'var(--border)' : 'transparent',
            duration: 0.3,
            overwrite: 'auto',
          });
        };
        updateNavbar();
        window.addEventListener('scroll', updateNavbar, { passive: true });
        cleanupHandlers.push(() => window.removeEventListener('scroll', updateNavbar));
      }
    }, rootRef);

    return () => {
      cleanupHandlers.forEach((cleanup) => cleanup());
      ctx.revert();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="min-h-screen overflow-x-hidden bg-background text-foreground font-sans selection:bg-primary/20"
    >
      {/* Header */}
      <header
        ref={navbarRef}
        className="fixed inset-x-0 top-0 z-50 border-b border-transparent bg-transparent transition-colors duration-300"
      >
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-10">
          <Link
            href="/"
            className="group relative isolate inline-flex items-center gap-2 overflow-hidden border border-border bg-background px-3 py-2"
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-[101%] bg-primary/10 transition-transform duration-300 group-hover:translate-x-0" />
            <Video className="relative z-10 h-4 w-4 text-primary" />
            <span className="relative z-10 text-xs font-semibold tracking-[0.05em]">つなぐレビュー</span>
          </Link>

          <nav className="hidden items-center gap-6 text-[11px] font-medium uppercase tracking-[0.14em] md:flex">
            <Link
              className="text-muted-foreground transition-colors hover:text-foreground"
              href="#features"
            >
              機能
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isLoggedIn ? (
              <Link href="/dashboard" className={controlButtonClass}>
                <span className="pointer-events-none absolute inset-0 -translate-x-[101%] bg-primary/10 transition-transform duration-300 group-hover:translate-x-0" />
                <span className="relative z-10 inline-flex items-center gap-2">
                  ダッシュボード
                  <MoveRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground hidden sm:block mr-4"
                >
                  ログイン
                </Link>
                <Link href="/register" className={controlButtonClass}>
                  <span className="pointer-events-none absolute inset-0 -translate-x-[101%] bg-primary/10 transition-transform duration-300 group-hover:translate-x-0" />
                  <span className="relative z-10">はじめる</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative">
        {/* 1) HERO */}
        <section className="relative flex min-h-[95vh] flex-col items-center justify-center px-4 pb-20 pt-32 text-center sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

          <div className="relative z-10 mx-auto max-w-[1000px] space-y-8">
            <div
              data-hero-copy
              className="inline-flex items-center gap-2 border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
              <span className="font-mono tracking-wide uppercase">ツナギビト社内ツール</span>
            </div>

            <h1
              data-hero-copy
              className="text-4xl font-semibold leading-[0.95] tracking-[-0.03em] sm:text-5xl md:text-6xl lg:text-7xl"
            >
              ワンリンクで確認・承認。 <br className="hidden md:block" />
              <span className="text-muted-foreground">タイムコードを追う手間はもう不要です。</span>
            </h1>

            <p
              data-hero-copy
              className="mx-auto max-w-2xl text-base text-muted-foreground md:text-xl"
            >
              動画編集チーム・関係者向けのレビューツール「つなぐレビュー」。コメント・音声メモ・
              注釈がひとつのタイムラインに集約され、ブラウザだけで確認が完結します。
            </p>

            <div
              data-hero-copy
              className="mx-auto flex max-w-md flex-col items-center justify-center gap-3"
            >
              <CtaLink
                href={hostedCtaHref}
                className="group relative isolate inline-flex h-12 min-w-max items-center justify-center overflow-hidden border border-primary bg-primary px-10 text-sm font-medium whitespace-nowrap text-primary-foreground transition-transform duration-300 hover:scale-[1.02]"
              >
                {hostedCtaLabel}
                <MoveRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </CtaLink>
            </div>
          </div>

          <div data-hero-copy className="relative mx-auto mt-20 w-full max-w-[1200px]">
            <div className="relative aspect-[16/9] w-full overflow-hidden border border-border bg-card shadow-2xl rounded-lg">
              <Image
                src="/landing/deep-dive-dashboard-2.webp"
                alt="製品画面のプレビュー"
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent pointer-events-none" />

              {/* Toolbar floating UI */}
              <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 border border-border/80 bg-background/90 p-2 backdrop-blur-md shadow-xl">
                <button className="flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90">
                  <PenTool className="h-4 w-4" />
                </button>
                <div className="h-6 w-px bg-border" />
                <button className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <MessageSquare className="h-4 w-4" />
                </button>
                <button className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <Mic className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 2) PROBLEM BLOCK */}
        <section className="border-y border-border bg-card/10 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1200px]">
            <div className="mx-auto max-w-4xl">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
                フィードバックが散らかると、こうなります。
              </h2>
              <ul className="mt-8 space-y-4 text-base text-muted-foreground md:text-lg">
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-5 w-5 shrink-0 text-red-500/80">✕</span>
                  <span>コメントがSlack・メール・スクリーンショットに散らばる。</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-5 w-5 shrink-0 text-red-500/80">✕</span>
                  <span>「1分12秒あたり」が結局10分の探し物になる。</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-5 w-5 shrink-0 text-red-500/80">✕</span>
                  <span>どのバージョンが最新か誰も分からなくなる。</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-5 w-5 shrink-0 text-red-500/80">✕</span>
                  <span>あいまいな指摘が、丸ごと1回分の修正手戻りになる。</span>
                </li>
              </ul>
              <div className="mt-10 border-l-2 border-primary/50 pl-4">
                <p className="text-base text-foreground md:text-lg">
                  つなぐレビューなら、これを全部「1つのリンク・1つのタイムライン」に集約します。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3) HOW IT WORKS */}
        <section className="border-b border-border bg-background px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1200px]">
            <div className="mb-16 text-center">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
                アップロードから承認まで、ひと続きに。
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-4 relative">
              {[
                { label: '動画をアップロード', icon: Upload },
                { label: 'レビューリンクを共有', icon: Share2 },
                { label: 'タイムスタンプ付きの意見が届く', icon: MessageSquare },
                { label: '承認して次に進む', icon: Check },
              ].map((step, idx, arr) => (
                <div key={step.label} className="group relative flex flex-col items-center">
                  <div className="flex flex-col items-center justify-center w-full min-h-[100px] md:aspect-[4/3] border border-border bg-card/20 px-4 py-6 md:p-6 text-center relative z-10 transition-all duration-300 group-hover:border-primary/40 group-hover:bg-card/40">
                    <div className="mb-4 flex h-8 w-8 md:h-10 md:w-10 items-center justify-center bg-secondary/50 text-primary border border-border/50 transition-colors group-hover:bg-primary/10">
                      <step.icon className="h-4 w-4 md:h-5 md:w-5" />
                    </div>
                    <p className="text-sm font-medium text-foreground md:text-base leading-tight">
                      {step.label}
                    </p>
                    <div className="absolute top-3 right-3 font-mono text-[10px] text-muted-foreground/30">
                      0{idx + 1}
                    </div>
                  </div>

                  {idx < arr.length - 1 && (
                    <div className="hidden md:flex absolute top-1/2 -right-4 -translate-y-1/2 z-20 items-center justify-center text-muted-foreground/20">
                      <MoveRight className="h-5 w-5" />
                    </div>
                  )}
                  {idx < arr.length - 1 && (
                    <div className="md:hidden flex py-4 text-muted-foreground/20">
                      <ArrowDown className="h-5 w-5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4) FEATURES */}
        <section id="features" className="scroll-mt-20 border-t border-border bg-card/10">
          {/* Feature 1 */}
          <div className="border-b border-border">
            <div className="mx-auto flex w-full max-w-[1200px] flex-col-reverse items-center justify-between gap-12 px-4 py-20 sm:px-6 lg:flex-row lg:px-8 lg:py-32">
              <div data-reveal className="w-full lg:w-1/2 relative">
                <div className="relative aspect-[16/10] w-full border border-border/50 bg-background overflow-hidden">
                  <Image
                    src="/landing/compare-v2.webp"
                    alt="バージョン比較モード"
                    fill
                    className="object-cover object-left-top"
                    sizes="(min-width: 1024px) 50vw, 100vw"
                  />
                  <div className="absolute inset-0 bg-background/5" />
                </div>
              </div>
              <div data-reveal className="w-full lg:w-1/2 space-y-6">
                <h2 className="text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
                  バージョンを並べて比較。「どのカットだっけ？」を終わらせる。
                </h2>
                <p className="text-base text-muted-foreground md:text-lg">
                  バージョン間で何が変わったかを実際に確認してから、自信を持って承認できます。
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-primary">修正サイクルを短縮。</p>
              </div>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="border-b border-border bg-background">
            <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-12 px-4 py-20 sm:px-6 lg:flex-row lg:px-8 lg:py-32">
              <div data-reveal className="w-full lg:w-1/2 space-y-6">
                <h2 className="text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
                  音声メモで、もっと伝わる。
                </h2>
                <p className="text-base text-muted-foreground md:text-lg">
                  「これってどういう意味？」というやり取りはもう不要。すべてのメモが動画の
                  その瞬間に紐づきます。
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-primary">
                  フィードバックが速く、誤解が減る。
                </p>
              </div>
              <div data-reveal className="w-full lg:w-1/2">
                <div className="border border-border bg-card p-6">
                  <div className="border border-border/50 bg-background p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center bg-secondary font-mono text-xs">
                          T
                        </div>
                        <div className="space-y-1">
                          <p className="font-mono text-[11px] font-medium leading-none">
                            ツナギビト
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">00:03:45</p>
                        </div>
                      </div>
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                    </div>
                    <div className="mt-6 flex h-16 items-center gap-1 overflow-hidden">
                      <button className="mr-2 flex h-8 w-8 flex-none items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90">
                        <Play className="h-3 w-3" />
                      </button>
                      {Array.from({ length: 40 }).map((_, i) => (
                        <span
                          key={i}
                          className="voice-bar w-full flex-1 bg-primary/60"
                          style={{
                            height: `${[30, 80, 50, 90, 40, 70, 60, 45, 85, 55, 65, 35, 95, 75, 25, 40, 80, 50, 90, 30][i % 20]}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="border-b border-border">
            <div className="mx-auto flex w-full max-w-[1200px] flex-col-reverse items-center justify-between gap-12 px-4 py-20 sm:px-6 lg:flex-row lg:px-8 lg:py-32">
              <div
                data-reveal
                className="w-full lg:w-1/2 relative aspect-video bg-card border border-border p-4"
              >
                <div className="relative h-full w-full border border-border/50 overflow-hidden bg-background">
                  <Image
                    src="https://images.unsplash.com/photo-1542204165-65bf26472b9b?auto=format&fit=crop&w=800&q=80"
                    alt="注釈"
                    fill
                    className="object-cover opacity-70"
                  />
                  <svg
                    className="absolute inset-0 h-full w-full pointer-events-none"
                    viewBox="0 0 800 450"
                    fill="none"
                  >
                    <circle
                      cx="500"
                      cy="225"
                      r="80"
                      stroke="#e2651e"
                      strokeWidth="4"
                      className="opacity-90 drop-shadow-[0_0_8px_rgba(226,101,30,0.8)]"
                    />
                    <path
                      d="M500 145 Q550 80 620 120"
                      stroke="#e2651e"
                      strokeWidth="4"
                      className="opacity-90"
                      strokeLinecap="round"
                    />
                  </svg>

                  {/* Circle Editor UI mock */}
                  <div className="absolute top-4 left-4 border border-border/50 bg-background/90 backdrop-blur-md p-2 flex flex-col gap-2">
                    <div className="flex gap-2">
                      <div className="h-6 w-6 rounded-full bg-red-500 cursor-pointer border-2 border-transparent"></div>
                      <div className="h-6 w-6 rounded-full bg-yellow-500 cursor-pointer border-2 border-transparent"></div>
                      <div className="h-6 w-6 rounded-full bg-green-500 cursor-pointer border-2 border-transparent"></div>
                      <div className="h-6 w-6 rounded-full bg-[#e2651e] cursor-pointer border-2 border-white"></div>
                    </div>
                    <div className="h-px w-full bg-border/50" />
                    <div className="flex gap-2">
                      <button className="flex h-8 w-8 items-center justify-center text-muted-foreground bg-primary/10 text-primary hover:bg-secondary">
                        <PenTool className="h-4 w-4" />
                      </button>
                      <button className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-secondary">
                        <MoveRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div data-reveal className="w-full lg:w-1/2 space-y-6">
                <h2 className="text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
                  指して、描いて、それで終わり。
                </h2>
                <p className="text-base text-muted-foreground md:text-lg">
                  勘違いの余地がない正確なフィードバック。動画のフレーム上に直接、丸で囲んだり
                  線を描いたりできます。
                </p>
                <p className="text-xs uppercase tracking-[0.14em] text-primary">
                  「そういう意味だと思ってた」を無くす。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5) EVERYTHING YOUR TEAM EXPECTS */}
        <section className="border-b border-border px-4 py-20 sm:px-6 lg:px-8 lg:py-32 bg-background">
          <div className="mx-auto w-full max-w-[1200px]">
            <div data-reveal className="mb-12 flex flex-col items-center text-center">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
                制作ワークフローに必要な機能を、ひと通り。
              </h2>
              <p className="mt-4 max-w-2xl text-base text-muted-foreground">
                レビューをもたつかせない、コアな機能だけを揃えています。
              </p>
            </div>

            <div className="space-y-10">
              <div>
                <p
                  data-reveal
                  className="mb-4 text-xs uppercase tracking-[0.14em] text-muted-foreground"
                >
                  コアワークフロー
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {coreWorkflowFeatures.map((feat) => (
                    <div
                      key={feat.title}
                      data-reveal
                      className="group border border-border bg-card p-6 transition-colors hover:border-primary/50 hover:bg-card/80"
                    >
                      <feat.icon className="mb-4 h-6 w-6 text-primary" />
                      <h3 className="mb-2 text-lg font-medium">{feat.title}</h3>
                      <p className="text-sm text-muted-foreground">{feat.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p
                  data-reveal
                  className="mb-4 text-xs uppercase tracking-[0.14em] text-muted-foreground"
                >
                  作業を加速する機能
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {workflowAcceleratorFeatures.map((feat) => (
                    <div
                      key={feat.title}
                      data-reveal
                      className="group border border-border bg-card p-6 transition-colors hover:border-primary/50 hover:bg-card/80"
                    >
                      <feat.icon className="mb-4 h-6 w-6 text-primary" />
                      <h3 className="mb-2 text-lg font-medium">{feat.title}</h3>
                      <p className="text-sm text-muted-foreground">{feat.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6) BUILT FOR REVIEWERS */}
        <section className="border-b border-border bg-card/20 px-4 py-20 sm:px-6 lg:px-8 lg:py-32">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col lg:flex-row gap-12 lg:items-center">
            <div data-reveal className="lg:w-1/2 space-y-6">
              <h2 className="text-4xl font-semibold tracking-[-0.02em] md:text-5xl">
                レビューする側はアカウント不要。ただ見て、意見を残すだけ。
              </h2>
              <p className="text-lg text-muted-foreground">
                取引先や社外の関係者に確認してもらう場面でも、ハードルなくレビューに参加できます。
              </p>
            </div>
            <div data-reveal className="lg:w-1/2 space-y-4">
              <div className="flex items-start gap-4 border border-border bg-background p-6 transition-transform hover:-translate-y-1">
                <LinkIcon className="mt-1 h-6 w-6 shrink-0 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold">リンクひとつで、ブラウザからレビュー。</h3>
                </div>
              </div>
              <div className="flex items-start gap-4 border border-border bg-background p-6 transition-transform hover:-translate-y-1">
                <Smartphone className="mt-1 h-6 w-6 shrink-0 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold">モバイルでも快適に使えます。</h3>
                </div>
              </div>
              <div className="flex items-start gap-4 border border-border bg-background p-6 transition-transform hover:-translate-y-1">
                <MessageSquare className="mt-1 h-6 w-6 shrink-0 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold">見落としようがない、タイムスタンプ付きの指摘。</h3>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7) SECURITY & PRIVACY */}
        <section className="border-b border-border bg-background px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto w-full max-w-[1200px]">
            <div data-reveal className="mx-auto max-w-4xl">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
                セキュリティとプライバシーを、設計段階から。
              </h2>
              <ul className="mt-8 space-y-4 text-base text-muted-foreground md:text-lg">
                <li>- 権限付きの共有リンク(閲覧・コメントできる相手を制御)</li>
                <li>- プロジェクトはデフォルトで非公開</li>
                <li>- いつでも動画・プロジェクトを削除可能</li>
                <li>- 自社インフラでセルフホスト、データは社外に出ない</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 8) FAQ */}
        <section className="border-b border-border bg-card/10 px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto w-full max-w-[1200px]">
            <div data-reveal className="mx-auto max-w-4xl">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] md:text-5xl">FAQ</h2>
              <div className="mt-10 space-y-4">
                {[
                  {
                    q: 'レビューする側もアカウントが必要ですか？',
                    a: 'いいえ。共有リンクがあればブラウザだけでレビューできます。',
                  },
                  {
                    q: '自社サーバーでホストされていますか？',
                    a: 'はい。ツナギビトが管理するAWS Lightsail上でセルフホストしており、データは社外の第三者サービスに送られません。',
                  },
                  {
                    q: 'フィードバックをエクスポートできますか？',
                    a: 'はい。PDF/CSV形式でアーカイブ・共有用にエクスポートできます。',
                  },
                  {
                    q: 'モバイルでも使えますか？',
                    a: 'はい。レビュー・コメントともにモバイルから利用できます。',
                  },
                  {
                    q: '誰が自分の動画にアクセスできますか？',
                    a: '招待されたメンバー、または権限を設定した共有リンクを持つ人のみです。',
                  },
                ].map((item) => (
                  <div key={item.q} className="border border-border bg-background p-6">
                    <h3 className="text-lg font-semibold">{item.q}</h3>
                    <p className="mt-2 text-sm text-muted-foreground md:text-base">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 9) FINAL CTA STRIP */}
        <section className="border-b border-border bg-background px-4 py-16 sm:px-6 lg:px-8">
          <div
            data-reveal
            className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left"
          >
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.02em] md:text-4xl">
                フィードバックを追いかけるのはもう終わり。
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                最初のレビューリンクは、数分で作れます。
              </p>
            </div>
            <CtaLink
              href={hostedCtaHref}
              className="group relative isolate inline-flex h-12 min-w-max items-center justify-center overflow-hidden border border-primary bg-primary px-10 text-sm font-medium whitespace-nowrap text-primary-foreground transition-transform duration-300 hover:scale-[1.02] md:min-w-[240px]"
            >
              {hostedCtaLabel}
            </CtaLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1200px] gap-8 sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <Video className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs text-muted-foreground">
                © 2026 合同会社ツナギビト. All rights reserved.
              </span>
              <span className="font-mono text-xs text-muted-foreground">社内利用限定ツール</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Legal
            </span>
            <div className="flex flex-col gap-1.5 sm:items-end">
              <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground">
                利用規約
              </Link>
              <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground">
                プライバシーポリシー
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
