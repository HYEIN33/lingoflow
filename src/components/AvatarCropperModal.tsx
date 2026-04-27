import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface AvatarCropperModalProps {
  file: File;
  uiLang: 'en' | 'zh';
  onCancel: () => void;
  onConfirm: (croppedBlob: Blob) => void;
}

/**
 * AvatarCropperModal — 与 user.html .cropper-modal 对齐。
 *
 * 交互：
 * - zoom 通过 range input 100-300（=1×~3×）控制 CSS transform
 * - pan 通过 mouse / touch 在 stage 上按住拖动
 * - 确认时用 canvas 按当前 zoom+pan 截取中心 70% 圆形区域（以方框输出 512×512 jpeg）
 *
 * 数学并不追求像素级精确，目标是出一个"合理的方形头像"作为上传产物。
 */
export default function AvatarCropperModal({ file, uiLang, onCancel, onConfirm }: AvatarCropperModalProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(160); // 1.6×
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // 为图片预览建立 objectURL，组件卸载时释放，避免泄漏
  const imageUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  };
  const onPointerUp = () => {
    setDragging(false);
    dragStart.current = null;
  };

  // 滚轮缩放
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setZoom((z) => Math.min(300, Math.max(100, z - Math.sign(e.deltaY) * 10)));
  };

  const handleConfirm = () => {
    const stageEl = stageRef.current;
    if (!stageEl) return;
    const stageSize = stageEl.clientWidth || 320;
    const cropSize = stageSize * 0.7;
    const scale = zoom / 100;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 以原图中心为原点 + pan 偏移，截取以 cropSize 为基准的方形区域
      const minSide = Math.min(img.naturalWidth, img.naturalHeight);
      // "cover" 基准下，原图在 stage 上被放大到至少填满 stage 的倍率
      const coverRatio = stageSize / minSide;
      // 缩放后原图每 1px 对应屏幕 (coverRatio * scale) 像素
      const stagePxPerImgPx = coverRatio * scale;
      // 屏幕上裁剪框对应的源图边长
      const srcSize = cropSize / stagePxPerImgPx;

      // pan 是屏幕坐标下图片中心相对 stage 中心的偏移，换算回图片坐标
      const cx = img.naturalWidth / 2 - pan.x / stagePxPerImgPx;
      const cy = img.naturalHeight / 2 - pan.y / stagePxPerImgPx;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(
        img,
        cx - srcSize / 2,
        cy - srcSize / 2,
        srcSize,
        srcSize,
        0,
        0,
        512,
        512,
      );
      canvas.toBlob(
        (blob) => {
          if (blob) onConfirm(blob);
        },
        'image/jpeg',
        0.92,
      );
    };
    img.src = imageUrl;
  };

  const bgTransform = `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom / 100})`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="surface max-w-[420px] w-full !rounded-[18px] p-[24px_26px] relative">
        <div className="flex items-center justify-between mb-[14px]">
          <h3
            className="m-0 text-[18px]"
            style={{ fontFamily: '"Clash Display", system-ui, sans-serif', fontWeight: 600, letterSpacing: '-0.02em' }}
          >
            {uiLang === 'zh' ? '更换头像 · Crop your photo' : 'Crop your photo · 更换头像'}
          </h3>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[rgba(10,14,26,0.04)]"
            title={uiLang === 'zh' ? '关闭' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stage */}
        <div
          ref={stageRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          className="relative w-full aspect-square rounded-[14px] overflow-hidden mb-4 select-none"
          style={{
            background: 'linear-gradient(135deg, rgba(91,127,232,0.15), rgba(229,56,43,0.1))',
            cursor: dragging ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
        >
          {/* 原图层（居中 + 受 pan / zoom 控制；以 "cover" 基准铺满 stage 后再缩放） */}
          <div
            className="absolute left-1/2 top-1/2 pointer-events-none"
            style={{
              width: '100%',
              height: '100%',
              backgroundImage: `url(${imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              transform: bgTransform,
              transformOrigin: 'center',
            }}
          />

          {/* 蒙层 + 裁剪圆（用 box-shadow 打 9999px 的大圆外遮） */}
          <div
            className="absolute top-1/2 left-1/2 rounded-full pointer-events-none"
            style={{
              width: '70%',
              aspectRatio: '1 / 1',
              transform: 'translate(-50%, -50%)',
              border: '2px dashed rgba(255,255,255,0.9)',
              boxShadow: '0 0 0 9999px rgba(10,14,26,0.55)',
            }}
          />

          {/* 提示 pill */}
          <span
            className="absolute left-1/2 rounded-full text-white text-[11px] pointer-events-none"
            style={{
              bottom: 10,
              transform: 'translateX(-50%)',
              background: 'rgba(10,14,26,0.72)',
              padding: '5px 12px',
              fontFamily: '"Noto Serif SC", serif',
              zIndex: 2,
            }}
          >
            {uiLang === 'zh' ? '拖动图片调整位置 · 滚动缩放' : 'Drag image · Scroll to zoom'}
          </span>
        </div>

        {/* Zoom row */}
        <div className="flex items-center gap-[10px] mb-[14px]">
          <span
            className="uppercase"
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 10,
              letterSpacing: '0.15em',
              color: 'rgba(10,14,26,0.5)',
            }}
          >
            zoom
          </span>
          <input
            type="range"
            min={100}
            max={300}
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value, 10))}
            className="flex-1 h-[3px]"
            style={{ accentColor: 'var(--blue-accent)' }}
          />
          <span
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 10,
              letterSpacing: '0.15em',
              color: 'var(--blue-accent)',
              fontWeight: 700,
            }}
          >
            {(zoom / 100).toFixed(1)}×
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-[10px]">
          <button
            onClick={onCancel}
            className="rounded-[14px] transition-colors"
            style={{
              flex: 1,
              padding: '11px',
              fontSize: 13,
              background: 'transparent',
              border: '1px solid var(--border-solid-strong)',
              color: 'var(--ink-body)',
              fontFamily: '"Noto Sans SC", system-ui, sans-serif',
              fontWeight: 600,
            }}
          >
            {uiLang === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-[14px] transition-colors"
            style={{
              flex: 2,
              padding: '11px',
              fontSize: 13,
              background: 'var(--ink)',
              color: '#fff',
              border: '1px solid var(--ink)',
              fontFamily: '"Noto Sans SC", system-ui, sans-serif',
              fontWeight: 700,
            }}
          >
            {uiLang === 'zh' ? '确认并上传' : 'Confirm & upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
