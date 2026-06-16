/**
 * FloatingSubtitle — 悬浮字幕窗（"像 YouTube 字幕"）
 *
 * 做什么：
 *   上课时把最新的【已翻译完成】双语字幕弹成一个能浮在所有窗口之上的
 *   小窗，让用户边看 PPT / 网课画面边看中文翻译，不用一直切回本页。
 *
 * 解决什么问题：
 *   网课全屏 / 看 PPT 时，本页的字幕被盖住了。原生 Document
 *   Picture-in-Picture 让浏览器开一个独立的、永远置顶的小窗，把字幕渲染
 *   进去，于是用户在任何应用之上都能瞥一眼翻译。
 *
 * 技术方案（Document Picture-in-Picture API）：
 *   - 支持检测：`'documentPictureInPicture' in window`
 *   - 打开：必须在用户点击事件里调
 *     `window.documentPictureInPicture.requestWindow({ width, height })`
 *     （需要 user gesture，所以 open() 直接绑在按钮 onClick 上）
 *   - 样式：把主文档的 styleSheet 克隆进 PiP 窗（能读 cssRules 的重建
 *     <style>，跨域读不到的 clone 原 <link>），再把 :root 上的设计令牌
 *     （--ink / --blue-accent 等）注入 PiP 文档，保证类名和 CSS 变量都在。
 *   - 渲染：用 React 19 的 createRoot 把字幕组件挂到 pip.document.body。
 *   - 关闭：监听 PiP 窗的 'pagehide' → 卸载 root、状态收回主页面；主页面
 *     也提供"关闭悬浮"按钮调 pip.close()。
 *
 * 降级（Safari / Firefox 等不支持 PiP）：
 *   点按钮改成在本页显示一个 position:fixed、底部居中、半透明、可拖拽的
 *   字幕条，同样显示最新字幕，并 toast 告知"已在页内显示"。
 *
 * 字幕样式：深色半透明底 + 白字（像视频字幕），保证在任何背景上可读。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// 最小类型声明 — window 上没有 documentPictureInPicture 的内置类型。
// 只声明我们实际用到的成员，其余不碰。
// ---------------------------------------------------------------------------
interface DocumentPictureInPictureWindowLike {
  document: Document;
  close: () => void;
  addEventListener: Window['addEventListener'];
  removeEventListener: Window['removeEventListener'];
}
interface DocumentPictureInPictureLike {
  requestWindow: (options?: {
    width?: number;
    height?: number;
  }) => Promise<DocumentPictureInPictureWindowLike>;
}

function getDocumentPiP(): DocumentPictureInPictureLike | null {
  if (typeof window === 'undefined') return null;
  if (!('documentPictureInPicture' in window)) return null;
  // 用到时再取，避免在不支持的浏览器里访问 undefined 成员。
  return (window as any).documentPictureInPicture as DocumentPictureInPictureLike;
}

export function isFloatingSubtitleSupported(): boolean {
  return getDocumentPiP() !== null;
}

// ---------------------------------------------------------------------------
// 字幕数据：从 ClassroomTab 的 StreamItem[] 里挑「已翻译完成」的行。
// 一条字幕 = kind:'line' && finalized && 有非空中文 translation。
// 这里只依赖最小字段形状，避免和 ClassroomTab 内部类型耦合。
// ---------------------------------------------------------------------------
export interface SubtitleLine {
  id: number;
  /** 中文译文（主） */
  translation: string;
  /** 英文原文（小字） */
  transcription: string;
}

interface StreamItemLike {
  kind: string;
  id: number;
  translation?: string;
  transcription?: string;
  finalized?: boolean;
}

/**
 * 从 stream 里取最近 `count` 条已翻译完成的字幕，按时间正序返回
 * （最后一条 = 最新）。
 */
export function pickLatestSubtitles(
  stream: ReadonlyArray<StreamItemLike>,
  count = 2,
): SubtitleLine[] {
  const out: SubtitleLine[] = [];
  for (let i = stream.length - 1; i >= 0 && out.length < count; i--) {
    const it = stream[i];
    if (it.kind !== 'line') continue;
    if (!it.finalized) continue;
    const zh = (it.translation || '').trim();
    if (!zh) continue;
    out.push({
      id: it.id,
      translation: zh,
      transcription: (it.transcription || '').trim(),
    });
  }
  return out.reverse();
}

// ---------------------------------------------------------------------------
// 字幕渲染体 — PiP 窗和页内降级条共用同一个内容组件，保证两边一致。
// 深色半透明底 + 白字，行内样式（不依赖外部类，PiP 窗里更稳）。
// 最新一条更亮更大，上一条略暗，符合"视频字幕"的阅读层级。
// ---------------------------------------------------------------------------
function SubtitleContent({
  lines,
  uiLang,
}: {
  lines: SubtitleLine[];
  uiLang: 'en' | 'zh';
}) {
  if (lines.length === 0) {
    return (
      <div
        style={{
          color: 'rgba(255,255,255,0.6)',
          fontSize: 14,
          textAlign: 'center',
          padding: '8px 4px',
          lineHeight: 1.5,
        }}
      >
        {uiLang === 'zh' ? '等待最新字幕…' : 'Waiting for subtitles…'}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        width: '100%',
      }}
    >
      {lines.map((line, idx) => {
        const isLatest = idx === lines.length - 1;
        return (
          <div key={line.id} style={{ opacity: isLatest ? 1 : 0.62 }}>
            <div
              style={{
                color: '#fff',
                fontSize: isLatest ? 19 : 15,
                fontWeight: 600,
                lineHeight: 1.4,
                textShadow: '0 1px 3px rgba(0,0,0,0.55)',
                wordBreak: 'break-word',
              }}
            >
              {line.translation}
            </div>
            {line.transcription && (
              <div
                style={{
                  color: 'rgba(255,255,255,0.72)',
                  fontSize: isLatest ? 12.5 : 11,
                  lineHeight: 1.35,
                  marginTop: 2,
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                  wordBreak: 'break-word',
                }}
              >
                {line.transcription}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 把主文档样式克隆进 PiP 文档：
//   1) 遍历 document.styleSheets，能读 cssRules 的重建成内联 <style>；
//      读不到的（跨域）clone 原始 <link>，让 PiP 窗自己再去拉。
//   2) 额外把 :root 上的设计令牌（CSS 变量）注入一份，确保类名引用的
//      var(--ink) 等在 PiP 文档里也解析得出。
// 单独 try/catch 每张表，一张失败不影响其它。
// ---------------------------------------------------------------------------
function clonePageStylesInto(pipDoc: Document) {
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules; // 跨域会在这里抛 SecurityError
        const style = pipDoc.createElement('style');
        let css = '';
        for (const rule of Array.from(rules)) css += rule.cssText + '\n';
        style.textContent = css;
        pipDoc.head.appendChild(style);
      } catch {
        // 跨域样式表读不到 cssRules → clone <link> 让 PiP 窗自己加载。
        const owner = sheet.ownerNode as HTMLLinkElement | null;
        if (owner && owner.tagName === 'LINK' && (owner as HTMLLinkElement).href) {
          const link = pipDoc.createElement('link');
          link.rel = 'stylesheet';
          link.href = (owner as HTMLLinkElement).href;
          pipDoc.head.appendChild(link);
        }
      }
    }
  } catch {
    /* styleSheets 整体不可用时静默 — 字幕用的是内联样式，仍可读 */
  }

  // 把 :root 的 CSS 变量复刻一份（设计令牌），保证 var(--ink) 等可解析。
  try {
    const rootStyles = getComputedStyle(document.documentElement);
    const tokens = [
      '--ink',
      '--ink-body',
      '--ink-soft',
      '--ink-muted',
      '--blue-accent',
      '--blue-accent-deep',
      '--blue-accent-text',
      '--surface-solid',
      '--green-ok',
      '--red-warn',
    ];
    let decl = '';
    for (const t of tokens) {
      const v = rootStyles.getPropertyValue(t);
      if (v && v.trim()) decl += `${t}: ${v.trim()};`;
    }
    if (decl) {
      const varStyle = pipDoc.createElement('style');
      varStyle.textContent = `:root{${decl}}`;
      pipDoc.head.appendChild(varStyle);
    }
  } catch {
    /* getComputedStyle 不可用时跳过 */
  }
}

// 给 PiP 文档的 body 套上"视频字幕底"外观（深色半透明、居中、留白）。
function styleParts(pipDoc: Document) {
  const b = pipDoc.body;
  b.style.margin = '0';
  b.style.padding = '12px 16px';
  b.style.boxSizing = 'border-box';
  b.style.minHeight = '100vh';
  b.style.display = 'flex';
  b.style.alignItems = 'flex-end';
  b.style.background = 'rgba(8, 11, 20, 0.92)';
  b.style.fontFamily =
    "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  b.style.userSelect = 'none';
  b.style.overflow = 'hidden';
}

// ---------------------------------------------------------------------------
// 页内降级条 — 不支持 PiP 时显示：position:fixed、底部居中、可拖拽。
// ---------------------------------------------------------------------------
function FallbackBar({
  lines,
  uiLang,
  onClose,
}: {
  lines: SubtitleLine[];
  uiLang: 'en' | 'zh';
  onClose: () => void;
}) {
  // 拖拽位置：null 表示还没拖过，用默认的"底部居中"。
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const el = barRef.current;
    if (!d || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // clamp 进视口，避免拖出屏幕找不回来。
    const x = Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - w);
    const y = Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - h);
    setPos({ x, y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    barRef.current?.releasePointerCapture(e.pointerId);
  };

  const positioned: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { left: '50%', bottom: 24, transform: 'translateX(-50%)' };

  return (
    <div
      ref={barRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="dialog"
      aria-label={uiLang === 'zh' ? '悬浮字幕' : 'Floating subtitle'}
      style={{
        position: 'fixed',
        zIndex: 2147483000, // 盖在一切之上（页内能做到的最高）
        width: 'min(520px, calc(100vw - 32px))',
        padding: '12px 40px 12px 16px',
        borderRadius: 14,
        background: 'rgba(8, 11, 20, 0.9)',
        backdropFilter: 'blur(6px)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
        cursor: 'grab',
        touchAction: 'none',
        ...positioned,
      }}
    >
      <SubtitleContent lines={lines} uiLang={uiLang} />
      <button
        type="button"
        onClick={onClose}
        aria-label={uiLang === 'zh' ? '关闭悬浮字幕' : 'Close floating subtitle'}
        title={uiLang === 'zh' ? '关闭悬浮字幕' : 'Close floating subtitle'}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 24,
          height: 24,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          border: 'none',
          background: 'rgba(255,255,255,0.14)',
          color: '#fff',
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}

type FloatingMode = 'pip' | 'fallback';

export interface FloatingSubtitleController {
  /** 是否正在悬浮（PiP 或页内条任一开着） */
  active: boolean;
  /** 当前模式：原生 PiP 窗，还是页内降级条 */
  mode: FloatingMode | null;
  /** 在用户点击事件里调（PiP 需要 user gesture） */
  open: () => void;
  /** 关闭悬浮（关 PiP 窗 / 收回页内条） */
  close: () => void;
  /** 页内降级条 — ClassroomTab 要把它渲染进 React 树；PiP 模式下为 null */
  fallbackNode: React.ReactNode;
}

/**
 * 悬浮字幕控制器 hook。
 *
 * 用法：
 *   const fs = useFloatingSubtitle(latestLines, uiLang);
 *   <button onClick={fs.open}>弹出悬浮字幕</button>
 *   ... 把 fs.fallbackNode 渲染进页面（不支持 PiP 时它才有内容）
 *
 * @param lines  当前要显示的最新字幕（已翻译完成的 1-2 条），随 stream 实时更新
 * @param uiLang UI 语言
 */
export function useFloatingSubtitle(
  lines: SubtitleLine[],
  uiLang: 'en' | 'zh',
): FloatingSubtitleController {
  const [mode, setMode] = useState<FloatingMode | null>(null);

  // PiP 窗 + 它的 React root 用 ref 持有，避免重渲染时丢引用。
  const pipWinRef = useRef<DocumentPictureInPictureWindowLike | null>(null);
  const pipRootRef = useRef<Root | null>(null);

  // 最新的 lines / uiLang 放 ref，让 PiP root 的 re-render 总拿到最新值，
  // 又不必把它们塞进 open() 的依赖里导致句柄重建。
  const linesRef = useRef(lines);
  const langRef = useRef(uiLang);
  useEffect(() => {
    linesRef.current = lines;
    langRef.current = uiLang;
  });

  // 把状态收回主页面（卸载 PiP root、清空 ref、复位 mode）。
  // 注意：不主动调 pip.close()——这个函数既被 pagehide 调（窗已在关），
  // 也被 close() 调（close() 自己负责关窗），避免重复关。
  const teardownPip = useCallback(() => {
    try {
      pipRootRef.current?.unmount();
    } catch {
      /* 已卸载 */
    }
    pipRootRef.current = null;
    pipWinRef.current = null;
    setMode((m) => (m === 'pip' ? null : m));
  }, []);

  const close = useCallback(() => {
    setMode((m) => {
      if (m === 'pip') {
        const win = pipWinRef.current;
        try {
          pipRootRef.current?.unmount();
        } catch {
          /* 已卸载 */
        }
        pipRootRef.current = null;
        pipWinRef.current = null;
        try {
          win?.close();
        } catch {
          /* 窗已关 */
        }
        return null;
      }
      return null; // fallback：直接收回页内条
    });
  }, []);

  const open = useCallback(() => {
    // 已经开着就不重复开。
    if (pipWinRef.current || mode) return;

    const pip = getDocumentPiP();

    // 降级：不支持 PiP → 页内条 + toast 提示。
    if (!pip) {
      setMode('fallback');
      toast.info(
        langRef.current === 'zh'
          ? '当前浏览器不支持弹出独立窗口，已在页内显示'
          : 'This browser cannot pop out a window — showing it inline',
      );
      return;
    }

    // 注意：requestWindow 必须在 user gesture 同步栈里启动（这里是 onClick）。
    pip
      .requestWindow({ width: 480, height: 140 })
      .then((pipWin) => {
        pipWinRef.current = pipWin;
        const doc = pipWin.document;

        // 标题 + 样式 + 字幕底外观。
        try {
          doc.title = langRef.current === 'zh' ? '悬浮字幕' : 'Floating subtitle';
        } catch {
          /* 某些实现 title 只读 */
        }
        clonePageStylesInto(doc);
        styleParts(doc);

        // React 19 createRoot 挂到 PiP 窗的 body。
        const root = createRoot(doc.body);
        pipRootRef.current = root;
        root.render(
          <SubtitleContent lines={linesRef.current} uiLang={langRef.current} />,
        );

        // PiP 窗被用户关掉（点窗口关闭键、回主页面等）→ pagehide → 收回状态。
        pipWin.addEventListener('pagehide', teardownPip, { once: true } as any);

        setMode('pip');
      })
      .catch((err) => {
        // 用户取消、被其它 PiP 占用、或无 gesture 等 → 降级到页内条。
        // 不当成致命错误：用户至少还能看到字幕。
        setMode('fallback');
        toast.info(
          langRef.current === 'zh'
            ? '无法弹出独立窗口，已在页内显示'
            : 'Could not pop out a window — showing it inline',
        );
        // 开发期能看到原因，但不打扰用户。
        if (import.meta.env?.DEV) console.warn('[FloatingSubtitle] PiP failed:', err);
      });
  }, [mode, teardownPip]);

  // PiP 模式下，lines / uiLang 变化时把最新字幕重渲染进 PiP 窗。
  useEffect(() => {
    if (mode === 'pip' && pipRootRef.current) {
      pipRootRef.current.render(<SubtitleContent lines={lines} uiLang={uiLang} />);
    }
  }, [lines, uiLang, mode]);

  // 组件卸载（例如离开课堂页）时确保关掉 PiP 窗，不留孤窗。
  useEffect(() => {
    return () => {
      try {
        pipRootRef.current?.unmount();
      } catch {
        /* 已卸载 */
      }
      try {
        pipWinRef.current?.close();
      } catch {
        /* 窗已关 */
      }
      pipRootRef.current = null;
      pipWinRef.current = null;
    };
  }, []);

  const fallbackNode =
    mode === 'fallback' ? (
      <FallbackBar lines={lines} uiLang={uiLang} onClose={close} />
    ) : null;

  return {
    active: mode !== null,
    mode,
    open,
    close,
    fallbackNode,
  };
}

// ---------------------------------------------------------------------------
// 触发按钮 — 放在课堂页 live 状态下、立即翻译按钮旁边。
// 样式对齐 FlushNowButton（白底蓝字 / 圆角）。激活时变成"关闭悬浮"。
// ---------------------------------------------------------------------------
export function FloatingSubtitleButton({
  uiLang,
  active,
  onOpen,
  onClose,
}: {
  uiLang: 'en' | 'zh';
  active: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={active ? onClose : onOpen}
      className={
        active
          ? 'mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[12px] bg-[var(--blue-accent)] text-white font-zh-sans text-[13px] font-bold hover:bg-[var(--blue-accent-deep)] transition-colors'
          : 'mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[12px] bg-white text-[var(--blue-accent)] border border-[rgba(91,127,232,0.3)] font-zh-sans text-[13px] font-bold hover:bg-[rgba(91,127,232,0.06)] transition-colors'
      }
      title={
        uiLang === 'zh'
          ? '把最新双语字幕弹成一个浮在所有窗口之上的小窗，边看 PPT 边看翻译'
          : 'Pop the latest subtitles into a small window that floats above everything'
      }
    >
      {active
        ? uiLang === 'zh'
          ? '关闭悬浮字幕'
          : 'Close floating subtitle'
        : uiLang === 'zh'
          ? '弹出悬浮字幕'
          : 'Pop out subtitle'}
    </button>
  );
}
