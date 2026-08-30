'use client';

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Undo2, Trash2, Minus, Plus, X, Pen, ArrowUpRight, Square } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type AnnotationTool = 'pen' | 'arrow' | 'rect';

export interface AnnotationStroke {
  // 省略時は 'pen'(既存の保存済みデータとの互換のため必ず optional)
  kind?: AnnotationTool;
  // 'arrow' / 'rect' は [始点, 終点] の2点固定。'pen' はフリーハンドの軌跡
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface AnnotationCanvasHandle {
  getStrokes: () => AnnotationStroke[];
}

interface AnnotationCanvasProps {
  mode: 'draw' | 'view';
  strokes?: AnnotationStroke[];
  onConfirm?: (strokes: AnnotationStroke[]) => void;
  onCancel?: () => void;
  onDismiss?: () => void; // For view mode, close overlay
}

const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FFFFFF'];
const DEFAULT_COLOR = '#FF3B30';
const DEFAULT_WIDTH = 3;
const MIN_WIDTH = 1;
const MAX_WIDTH = 10;

// Reference canvas width for stroke scaling
const REF_WIDTH = 1000;

const TOOLS: { id: AnnotationTool; icon: LucideIcon; label: string }[] = [
  { id: 'pen', icon: Pen, label: 'ペン' },
  { id: 'arrow', icon: ArrowUpRight, label: '矢印' },
  { id: 'rect', icon: Square, label: '四角形' },
];

export const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(
  function AnnotationCanvas(
    { mode, strokes: initialStrokes, onConfirm, onCancel, onDismiss },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [strokes, setStrokes] = useState<AnnotationStroke[]>(initialStrokes || []);
    const [currentStroke, setCurrentStroke] = useState<AnnotationStroke | null>(null);
    const [color, setColor] = useState(DEFAULT_COLOR);
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const [tool, setTool] = useState<AnnotationTool>('pen');
    const isDrawingRef = useRef(false);
    void onConfirm;

    // Expose getStrokes so parent can grab current drawing without confirm
    useImperativeHandle(
      ref,
      () => ({
        getStrokes: () => strokes,
      }),
      [strokes]
    );

    // Render all strokes
    const renderStrokes = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        strokeList: AnnotationStroke[],
        active?: AnnotationStroke | null
      ) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const scale = canvas.width / REF_WIDTH;

        const draw = (s: AnnotationStroke) => {
          if (s.points.length < 2) return;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width * scale;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          if (s.kind === 'rect') {
            const x0 = s.points[0].x * canvas.width;
            const y0 = s.points[0].y * canvas.height;
            const x1 = s.points[1].x * canvas.width;
            const y1 = s.points[1].y * canvas.height;
            // 枠線のみ(塗りつぶしなし)
            ctx.strokeRect(
              Math.min(x0, x1),
              Math.min(y0, y1),
              Math.abs(x1 - x0),
              Math.abs(y1 - y0)
            );
            return;
          }

          if (s.kind === 'arrow') {
            const x0 = s.points[0].x * canvas.width;
            const y0 = s.points[0].y * canvas.height;
            const x1 = s.points[1].x * canvas.width;
            const y1 = s.points[1].y * canvas.height;
            const angle = Math.atan2(y1 - y0, x1 - x0);
            // 矢じりは線幅に比例させる
            const headLen = Math.max(ctx.lineWidth * 3, 10 * scale);
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.moveTo(x1, y1);
            ctx.lineTo(
              x1 - headLen * Math.cos(angle - Math.PI / 6),
              y1 - headLen * Math.sin(angle - Math.PI / 6)
            );
            ctx.moveTo(x1, y1);
            ctx.lineTo(
              x1 - headLen * Math.cos(angle + Math.PI / 6),
              y1 - headLen * Math.sin(angle + Math.PI / 6)
            );
            ctx.stroke();
            return;
          }

          // 'pen'(kind 省略の既存データを含む)はフリーハンド描画
          ctx.beginPath();
          ctx.moveTo(s.points[0].x * canvas.width, s.points[0].y * canvas.height);
          for (let i = 1; i < s.points.length; i++) {
            ctx.lineTo(s.points[i].x * canvas.width, s.points[i].y * canvas.height);
          }
          ctx.stroke();
        };

        strokeList.forEach(draw);
        if (active) draw(active);
      },
      []
    );

    // Keep a stable ref to the latest strokes/currentStroke so the resize
    // handler can redraw without being listed as a dependency (which would
    // re-register the listener on every stroke change).
    const strokesRef = useRef(strokes);
    const currentStrokeRef = useRef(currentStroke);
    useEffect(() => {
      strokesRef.current = strokes;
    }, [strokes]);
    useEffect(() => {
      currentStrokeRef.current = currentStroke;
    }, [currentStroke]);

    // Resize canvas to match container — listener registered once, never re-added.
    useEffect(() => {
      const resizeCanvas = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        const ctx = canvas.getContext('2d');
        if (ctx) renderStrokes(ctx, canvas, strokesRef.current, currentStrokeRef.current);
      };

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      return () => window.removeEventListener('resize', resizeCanvas);
    }, [renderStrokes]); // renderStrokes is stable (useCallback with no deps that change)

    // Re-render on stroke changes
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderStrokes(ctx, canvas, strokes, currentStroke);
    }, [strokes, currentStroke, renderStrokes]);

    const getPoint = useCallback((e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      let clientX: number, clientY: number;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
    }, []);

    const handlePointerDown = useCallback(
      (e: React.MouseEvent | React.TouchEvent) => {
        if (mode !== 'draw') return;
        e.preventDefault();
        e.stopPropagation();
        const pt = getPoint(e);
        if (!pt) return;
        isDrawingRef.current = true;
        // ペンは kind を付けない(既存データと同じ形を保つ)。矢印/四角形は始点+終点の2点で持つ
        setCurrentStroke(
          tool === 'pen'
            ? { points: [pt], color, width }
            : { kind: tool, points: [pt, pt], color, width }
        );
      },
      [mode, tool, color, width, getPoint]
    );

    const handlePointerMove = useCallback(
      (e: React.MouseEvent | React.TouchEvent) => {
        if (mode !== 'draw' || !isDrawingRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        const pt = getPoint(e);
        if (!pt) return;
        setCurrentStroke((prev) => {
          if (!prev) return prev;
          // 矢印/四角形はドラッグ中に終点だけ更新(ライブプレビュー)
          if (prev.kind === 'arrow' || prev.kind === 'rect') {
            return { ...prev, points: [prev.points[0], pt] };
          }
          return { ...prev, points: [...prev.points, pt] };
        });
      },
      [mode, getPoint]
    );

    const handlePointerUp = useCallback(
      (e: React.MouseEvent | React.TouchEvent) => {
        if (mode !== 'draw' || !isDrawingRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        isDrawingRef.current = false;
        setCurrentStroke((prev) => {
          if (prev && prev.points.length >= 2) {
            // ドラッグせずクリックしただけの矢印/四角形(始点=終点)は確定しない
            const degenerateShape =
              (prev.kind === 'arrow' || prev.kind === 'rect') &&
              prev.points[0].x === prev.points[1].x &&
              prev.points[0].y === prev.points[1].y;
            if (!degenerateShape) {
              setStrokes((s) => [...s, prev]);
            }
          }
          return null;
        });
      },
      [mode]
    );

    const handleUndo = useCallback(() => {
      setStrokes((prev) => prev.slice(0, -1));
    }, []);

    const handleClear = useCallback(() => {
      setStrokes([]);
    }, []);

    // View mode: click to dismiss
    const handleViewClick = useCallback(
      (e: React.MouseEvent) => {
        if (mode === 'view') {
          e.stopPropagation();
          onDismiss?.();
        }
      },
      [mode, onDismiss]
    );

    if (mode === 'view') {
      return (
        <div
          ref={containerRef}
          className="absolute inset-0 z-[60] cursor-pointer"
          onClick={handleViewClick}
          title="クリックで注釈を閉じる"
        >
          <canvas ref={canvasRef} className="w-full h-full pointer-events-none" />
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="absolute inset-0 z-[60]"
        onClick={(e) => e.stopPropagation()}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />

        {/* Toolbar */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center justify-center flex-wrap gap-x-2 gap-y-2 w-[calc(100%-24px)] max-w-fit bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg border z-[70]">
          {/* Tools */}
          <div className="flex items-center gap-1">
            {TOOLS.map(({ id, icon: Icon, label }) => (
              <Button
                key={id}
                variant={tool === id ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setTool(id)}
                title={label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>

          <div className="hidden sm:block w-px h-6 bg-border mx-1" />

          {/* Colors */}
          <div className="flex items-center justify-center flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 shrink-0"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? 'white' : 'transparent',
                  boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
                }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          <div className="hidden sm:block w-px h-6 bg-border mx-1" />

          {/* Brush size */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setWidth((w) => Math.max(MIN_WIDTH, w - 1))}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-xs tabular-nums w-4 text-center">{width}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setWidth((w) => Math.min(MAX_WIDTH, w + 1))}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          <div className="hidden sm:block w-px h-6 bg-border mx-1" />

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleUndo}
              disabled={strokes.length === 0}
              title="元に戻す"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:bg-destructive/10"
              onClick={handleClear}
              disabled={strokes.length === 0}
              title="すべて消去"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="hidden sm:block w-px h-6 bg-border mx-1" />

          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onCancel}
            title="注釈ツールを閉じる"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }
);
