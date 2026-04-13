'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  mainSrc: string;
  images: string[];
  thumbnails: string[];
  activeImageIndex: number;
  onSelectImage: (i: number) => void;
  title?: string;
  /** 为 true 时隐藏内嵌缩略图轨（由外层自定轨道，如发布页的拖拽排序） */
  hideInlineThumbRail?: boolean;
  /** 为 true 时大图查看器内不展示收藏/下载/举报菜单（发布页本地图片） */
  disableViewerContextMenu?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function signedDistance(from: number, to: number) {
  return to - from;
}

export function MediaColumnTranslateX({
  mainSrc,
  images,
  thumbnails,
  activeImageIndex,
  onSelectImage,
  title,
  hideInlineThumbRail = false,
  disableViewerContextMenu = false,
}: Props) {
  const total = images.length;
  const lastIndex = Math.max(0, total - 1);

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(() => clamp(activeImageIndex, 0, lastIndex));
  const [displayIndex, setDisplayIndex] = useState(() => clamp(activeImageIndex, 0, lastIndex));
  const [menu, setMenu] = useState<null | { x: number; y: number; imageIndex: number }>(null);
  const [mainImageAnimName, setMainImageAnimName] = useState<'trip-main-image-in-from-right' | 'trip-main-image-in-from-left'>(
    'trip-main-image-in-from-right',
  );
  const [inlineCounterVisible, setInlineCounterVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeMenuByImageTapRef = useRef(false);
  const singleClickTimerRef = useRef<number | null>(null);
  const SINGLE_CLICK_DELAY_MS = 220;
  const baseIndexRef = useRef(index);
  const displayIndexRef = useRef(displayIndex);
  const prevMainIndexRef = useRef(index);
  const inlineCounterTimerRef = useRef<number | null>(null);

  useEffect(() => {
    baseIndexRef.current = index;
    setDisplayIndex(index);
    displayIndexRef.current = index;
  }, [index]);

  // 主图区切图方向：下一张从右入，上一张从左入
  useEffect(() => {
    const prev = prevMainIndexRef.current;
    if (index !== prev) {
      setMainImageAnimName(index > prev ? 'trip-main-image-in-from-right' : 'trip-main-image-in-from-left');
      prevMainIndexRef.current = index;
    }
  }, [index]);

  // 帖子页 now/last：切图后显示 1 秒自动消失
  useEffect(() => {
    if (total <= 1) return;
    setInlineCounterVisible(true);
    if (inlineCounterTimerRef.current) {
      window.clearTimeout(inlineCounterTimerRef.current);
      inlineCounterTimerRef.current = null;
    }
    inlineCounterTimerRef.current = window.setTimeout(() => {
      setInlineCounterVisible(false);
      inlineCounterTimerRef.current = null;
    }, 1000);
  }, [index, total]);

  useEffect(() => {
    // 外部 activeImageIndex 变化时，同步到线性边界内
    setIndex(clamp(activeImageIndex, 0, lastIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImageIndex, lastIndex]);

  // 兼容父组件的 Escape 逻辑
  useEffect(() => {
    (window as any).__tripPostImageViewerOpen = open;
    return () => {
      (window as any).__tripPostImageViewerOpen = false;
    };
  }, [open]);

  useEffect(() => {
    const onCloseViewer = () => setOpen(false);
    window.addEventListener('trip:close-post-image-viewer', onCloseViewer);
    return () => window.removeEventListener('trip:close-post-image-viewer', onCloseViewer);
  }, []);

  // =========================
  // 物理引擎参数
  // =========================
  const progress = useRef(0);       // 连续位置（0 = 中心图）
  const velocity = useRef(0);       // 速度
  const raf = useRef<number | null>(null);
  const animatingRef = useRef(false);
  const settleTargetRef = useRef<number | null>(null);
  const isFullscreenRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const zoomScaleRef = useRef(1);
  const [zoomScale, setZoomScale] = useState(1);
  const zoomOriginRef = useRef<{ x: number; y: number } | null>(null);

  const slidesRef = useRef<HTMLDivElement[]>([]);
  const clipRef = useRef<HTMLDivElement | null>(null);
  const thumbRailRef = useRef<HTMLDivElement | null>(null);
  const thumbBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const thumbAlignRafRef = useRef<number | null>(null);
  const setRef = (el: HTMLDivElement | null, i: number) => {
    if (el) slidesRef.current[i] = el;
  };
  const setThumbRef = (el: HTMLButtonElement | null, i: number) => {
    thumbBtnRefs.current[i] = el;
  };

  const animateThumbRailTo = (rail: HTMLDivElement, targetLeft: number) => {
    if (thumbAlignRafRef.current) {
      cancelAnimationFrame(thumbAlignRafRef.current);
      thumbAlignRafRef.current = null;
    }
    const startLeft = rail.scrollLeft;
    const delta = targetLeft - startLeft;
    if (Math.abs(delta) < 0.5) {
      rail.scrollLeft = targetLeft;
      return;
    }
    const duration = 260;
    const startAt = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const frame = (now: number) => {
      const t = Math.min(1, (now - startAt) / duration);
      rail.scrollLeft = startLeft + delta * easeOutCubic(t);
      if (t < 1) {
        thumbAlignRafRef.current = requestAnimationFrame(frame);
      } else {
        thumbAlignRafRef.current = null;
      }
    };
    thumbAlignRafRef.current = requestAnimationFrame(frame);
  };

  // =========================
  // 核心渲染：位置、缩放、透明度、景深模糊、视差
  // =========================
  const render = () => {
    slidesRef.current.forEach((el, i) => {
      if (!el) return;

      const pos = signedDistance(baseIndexRef.current, i);
      const p = pos - progress.current;

      const depth = Math.abs(p);

      // 缩放：深度越大图片越小，最大缩小至 0.6
      const scale = 1 - Math.min(depth * 0.2, 0.4);
      // 透明度：深度越大越透明
      const opacity = 1 - depth * 0.4;

      // 内部图片的视差效果（微移动）
      const img = el.querySelector('img') as HTMLImageElement | null;
      if (img) {
        // 用 translate3d 避免高速时“容器与图不同步”的视觉
        img.style.transform = `translate3d(${p * -20}px, 0, 0)`;
        const blur = depth === 0 ? 0 : Math.min(depth * 8, 14);
        img.style.filter = `blur(${blur}px)`;
      }

      // 位置计算：基于视口中心；侧图向中心收 10%
      const base = window.innerWidth / 2;
      const offset = p * 0.468 * window.innerWidth;
      // 侧图朝主图方向倾斜：静止时到 30deg，动画过程中按 p 连续变化
      const tilt = clamp(-p * 30, -30, 30);
      el.style.transform = `translateX(${base + offset}px) translateX(-50%) perspective(1600px) rotateY(${tilt}deg) scale(${scale})`;

      // 容器不做模糊，避免圆角在 3D/滤镜下看起来失效
      el.style.filter = 'none';

      el.style.opacity = String(opacity);
      el.style.zIndex = String(10 - depth * 10);
      el.style.transformStyle = 'preserve-3d';
    });

    // 同步右上角 now/last：按当前动画中的可视中心图实时更新
    const visualCenter = clamp(baseIndexRef.current + progress.current, 0, lastIndex);
    const nextDisplay = clamp(Math.round(visualCenter), 0, lastIndex);
    if (nextDisplay !== displayIndexRef.current) {
      displayIndexRef.current = nextDisplay;
      setDisplayIndex(nextDisplay);
    }
  };

  // =========================
  // 物理动画循环
  // =========================
  const step = () => {
    render();
    if (!animatingRef.current) {
      progress.current += velocity.current;
      velocity.current *= 0.96;       // 摩擦系数，让滑动更快停止

      // ✅ 非循环：限制 progress 在边界范围内（避免越界虚滑）
      const maxLeft = baseIndexRef.current; // 最多向左滑 baseIndex 张
      const maxRight = lastIndex - baseIndexRef.current; // 最多向右滑到 last
      progress.current = clamp(progress.current, -maxLeft, maxRight);

      // 速度极小，开始吸附
      const inertiaTail = wheelInertiaModeRef.current;
      const settleVelocityThreshold = inertiaTail ? 0.008 : 0.002;
      if (Math.abs(velocity.current) < settleVelocityThreshold) {
        const tailVelocity = velocity.current;
        velocity.current = 0;
        // 只在进入吸附时计算一次目标，避免中途跨过中线后回弹
        if (settleTargetRef.current === null) {
          const settlePrediction = progress.current;
          const movingDir = Math.sign(tailVelocity);
          if (movingDir > 0) {
            settleTargetRef.current = Math.ceil(settlePrediction);
          } else if (movingDir < 0) {
            settleTargetRef.current = Math.floor(settlePrediction);
          } else {
            settleTargetRef.current = Math.round(settlePrediction);
          }
          settleTargetRef.current = clamp(settleTargetRef.current, -maxLeft, maxRight);
        }
        const target = settleTargetRef.current;
        const diff = target - progress.current;
        // 锁定目标后平滑吸附：放缓收敛速度，避免视觉突兀
        const settleLerp = inertiaTail ? 0.12 : 0.05;
        const settleStepMax = inertiaTail ? 0.065 : 0.035;
        const settleDelta = clamp(diff * settleLerp, -settleStepMax, settleStepMax);
        progress.current += settleDelta;

        // 吸附完成，触发索引切换
        const finishThreshold = inertiaTail ? 0.012 : 0.002;
        if (Math.abs(diff) < finishThreshold) {
          const move = Math.round(progress.current);
          const next = clamp(baseIndexRef.current + move, 0, lastIndex);
          baseIndexRef.current = next;
          setIndex(next);
          onSelectImage(next);
          progress.current = 0;
          velocity.current = 0;
          settleTargetRef.current = null;
          if (inertiaTail) wheelInertiaModeRef.current = false;
        }
      } else {
        // 仍在惯性滑动阶段，不锁定吸附目标
        settleTargetRef.current = null;
      }
    }
    raf.current = requestAnimationFrame(step);
  };

  // 启动动画循环
  useEffect(() => {
    if (!open) return;
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [open, index]);

  // =========================
  // 预加载相邻图片
  // =========================
  useEffect(() => {
    if (total <= 0) return;
    const preload = (i: number) => {
      if (i < 0 || i > lastIndex) return;
      const img = new Image();
      img.src = images[i];
    };
    preload(index + 1);
    preload(index - 1);
    preload(index + 2);
    preload(index - 2);
  }, [index, total, images, lastIndex]);

  // =========================
  // 拖拽（鼠标/触摸）带速度计算
  // =========================
  const startX = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const dragging = useRef(false);
  const pointerDown = useRef(false);
  const moved = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const downTargetIsImage = useRef(false);
  const downClient = useRef({ x: 0, y: 0 });
  const DRAG_THRESHOLD_PX = 7;

  const onDown = (e: React.PointerEvent) => {
    if (singleClickTimerRef.current) {
      window.clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }
    setMenu(null);
    // 全屏缩放模式下不允许滑动切图（避免滚轮/点击冲突）
    if (isFullscreenRef.current) return;
    pointerDown.current = true;
    moved.current = false;
    dragging.current = false;
    pointerIdRef.current = e.pointerId;
    downClient.current = { x: e.clientX, y: e.clientY };
    startX.current = e.clientX;
    lastX.current = e.clientX;
    lastTime.current = performance.now();
    velocity.current = 0;
    settleTargetRef.current = null;
    // 单击不直接 capture，只有确认为拖拽后再 capture
    const t = e.target as HTMLElement | null;
    downTargetIsImage.current = Boolean(t && t.closest('[data-media-clip]'));
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pointerDown.current) return;
    if (isFullscreenRef.current) return;
    const dxTotal = e.clientX - startX.current;
    const dyTotal = e.clientY - downClient.current.y;
    if (!dragging.current) {
      if (Math.hypot(dxTotal, dyTotal) < DRAG_THRESHOLD_PX) return;
      dragging.current = true;
      moved.current = true;
      if (pointerIdRef.current !== null) {
        e.currentTarget.setPointerCapture(pointerIdRef.current);
      }
      setMenu(null);
    }
    const dx = e.clientX - lastX.current;
    const now = performance.now();
    const dt = Math.max(now - lastTime.current, 1); // 避免除零

    // 更新进度（负号：手指右滑 => 图片向左移动）
    progress.current -= dx / window.innerWidth;
    // ✅ 非循环：拖拽时也限制范围
    const maxLeft = baseIndexRef.current;
    const maxRight = lastIndex - baseIndexRef.current;
    progress.current = clamp(progress.current, -maxLeft, maxRight);

    // 计算速度，提高灵敏度（系数 -0.08）
    velocity.current = (dx / dt) * -0.08;

    lastX.current = e.clientX;
    lastTime.current = now;
    render();
  };

  const onUp = (e: React.PointerEvent) => {
    if (isFullscreenRef.current) return;
    pointerDown.current = false;
    const wasDragging = dragging.current;
    dragging.current = false;
    settleTargetRef.current = null;
    if (pointerIdRef.current !== null) {
      try {
        e.currentTarget.releasePointerCapture(pointerIdRef.current);
      } catch {
        // ignore
      }
    }
    pointerIdRef.current = null;
    // 单击打开气泡改为走图片点击事件（避免与遮罩 click 冲突）
    if (wasDragging) moved.current = true;
  };

  const wheelBurstCountRef = useRef(0);
  const wheelBurstDeltaSumRef = useRef(0);
  const wheelBurstTimerRef = useRef<number | null>(null);
  const wheelInertiaModeRef = useRef(false);
  const inlineWheelBurstCountRef = useRef(0);
  const inlineWheelDeltaSumRef = useRef(0);
  const inlineWheelTimerRef = useRef<number | null>(null);

  const goByStep = (dir: 1 | -1) => {
    if (total <= 0) return;
    progress.current = 0;
    velocity.current = 0;
    const next = clamp(baseIndexRef.current + dir, 0, lastIndex);
    baseIndexRef.current = next;
    setIndex(next);
    onSelectImage(next);
  };

  const rebaseToCurrentCenter = () => {
    if (total <= 0) return;
    // 将内部基准索引重定锚到当前“正在显示的中心图”
    const move = Math.round(progress.current);
    if (move === 0) {
      velocity.current = 0;
      wheelInertiaModeRef.current = false;
      return;
    }

    const oldBase = baseIndexRef.current;
    const nextBase = clamp(oldBase + move, 0, lastIndex);
    const effectiveMove = nextBase - oldBase;
    baseIndexRef.current = nextBase;
    // 保留残差：避免惯性中段“跳帧/看起来错一张”
    progress.current = progress.current - effectiveMove;
    velocity.current = 0;
    wheelInertiaModeRef.current = false;
    settleTargetRef.current = null;
    setIndex(nextBase);
    onSelectImage(nextBase);
    render();
  };

  const animateByStep = (dir: 1 | -1) => {
    if (total <= 0) return;
    if (animatingRef.current) return;

    animatingRef.current = true;
    velocity.current = 0;
    settleTargetRef.current = null;

    const duration = 420;
    const start = performance.now();

    const frame = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      progress.current = dir * ease; // 让 render 产生平滑过渡
      render();

      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        const next = clamp(baseIndexRef.current + dir, 0, lastIndex);
        baseIndexRef.current = next;
        setIndex(next);
        onSelectImage(next);
        progress.current = 0;
        velocity.current = 0;
        animatingRef.current = false;
        render();
      }
    };

    requestAnimationFrame(frame);
  };

  // =========================
  // 滚轮支持
  // =========================
  useEffect(() => {
    if (!open) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setMenu(null);

      // 真全屏时：滚轮缩放（按鼠标位置）
      if (isFullscreenRef.current) {
        const max = 3;
        const min = 1;
        const step = Math.abs(e.deltaY) < 40 ? 0.08 : 0.14;
        const next = clamp(zoomScaleRef.current + (e.deltaY < 0 ? step : -step), min, max);
        zoomScaleRef.current = next;
        setZoomScale(next);

        // 记录缩放原点（按当前鼠标在可视图中的位置）
        const clip = clipRef.current;
        if (clip) {
          const rect = clip.getBoundingClientRect();
          const ox = clamp((e.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
          const oy = clamp((e.clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
          zoomOriginRef.current = { x: ox, y: oy };
          clip.style.transformOrigin = `${ox * 100}% ${oy * 100}%`;
        }
        return;
      }

      wheelBurstCountRef.current += 1;
      wheelBurstDeltaSumRef.current += e.deltaY;

      // “1-5 次”视为一个短滚动 burst：等待 burst 结束后只切换 1 张
      // 超过 5 次则进入惯性模式（保持现有效果）
      if (wheelBurstTimerRef.current) window.clearTimeout(wheelBurstTimerRef.current);
      wheelBurstTimerRef.current = window.setTimeout(() => {
        const count = wheelBurstCountRef.current;
        const sum = wheelBurstDeltaSumRef.current;
        wheelBurstCountRef.current = 0;
        wheelBurstDeltaSumRef.current = 0;

        if (count >= 1 && count <= 5) {
          // 1-5 次 burst：每次只切 1 张，但要有动画过渡
          if (wheelInertiaModeRef.current) {
            rebaseToCurrentCenter();
          }
          animateByStep(sum >= 0 ? 1 : -1);
        }
      }, 140);

      if (wheelBurstCountRef.current <= 5) return;

      // 超过 5 次：沿用惯性效果
      wheelInertiaModeRef.current = true;
      settleTargetRef.current = null;
      const isTrackpad = Math.abs(e.deltaY) < 40;
      const multiplier = isTrackpad ? 0.0006 : 0.00025;
      velocity.current += e.deltaY * multiplier;
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
      if (wheelBurstTimerRef.current) {
        window.clearTimeout(wheelBurstTimerRef.current);
      }
      wheelBurstCountRef.current = 0;
      wheelBurstDeltaSumRef.current = 0;
      wheelInertiaModeRef.current = false;
      settleTargetRef.current = null;
    };
  }, [open, total]);

  // 帖子页（非查看器）主图滚轮切图
  useEffect(() => {
    return () => {
      if (inlineWheelTimerRef.current) {
        window.clearTimeout(inlineWheelTimerRef.current);
        inlineWheelTimerRef.current = null;
      }
    };
  }, []);

  // 任何按键都收起气泡（避免残留）
  useEffect(() => {
    if (!open) return;
    const onKeyDown = () => setMenu(null);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // 键盘切图：左右方向键（避免在输入框内误触）
  useEffect(() => {
    const isEditableTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (total <= 1) return;
      // 在查看器打开时优先处理（带动画），否则处理帖子页主图切换
      e.preventDefault();
      setMenu(null);
      const dir: 1 | -1 = e.key === 'ArrowRight' ? 1 : -1;
      if (open) {
        animateByStep(dir);
      } else {
        goByStep(dir);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, total, lastIndex]);

  useEffect(() => {
    return () => {
      if (singleClickTimerRef.current) {
        window.clearTimeout(singleClickTimerRef.current);
        singleClickTimerRef.current = null;
      }
      if (inlineCounterTimerRef.current) {
        window.clearTimeout(inlineCounterTimerRef.current);
        inlineCounterTimerRef.current = null;
      }
    };
  }, []);

  // 监听真全屏状态
  useEffect(() => {
    if (!open) return;
    const onFs = () => {
      const fs = Boolean(document.fullscreenElement);
      isFullscreenRef.current = fs;
      setIsFullscreen(fs);
      if (!fs) {
        zoomScaleRef.current = 1;
        setZoomScale(1);
        zoomOriginRef.current = null;
        if (clipRef.current) {
          clipRef.current.style.transformOrigin = '50% 50%';
        }
      } else {
        // 进入全屏默认居中
        if (clipRef.current) clipRef.current.style.transformOrigin = '50% 50%';
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    onFs();
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [open]);

  // 图片查看器打开时隐藏“帖子关闭键”，避免与查看器控件重叠
  useEffect(() => {
    const postCloseButtons = Array.from(
      document.querySelectorAll('button[aria-label="关闭帖子详情"]'),
    ) as HTMLButtonElement[];

    postCloseButtons.forEach((btn) => {
      if (open) {
        // 保存原 display，退出全屏时恢复
        if (!btn.dataset.viewerPrevDisplay) {
          btn.dataset.viewerPrevDisplay = btn.style.display || '';
        }
        btn.style.display = 'none';
      } else if (btn.dataset.viewerPrevDisplay !== undefined) {
        btn.style.display = btn.dataset.viewerPrevDisplay;
        delete btn.dataset.viewerPrevDisplay;
      }
    });

    return () => {
      postCloseButtons.forEach((btn) => {
        if (btn.dataset.viewerPrevDisplay !== undefined) {
          btn.style.display = btn.dataset.viewerPrevDisplay;
          delete btn.dataset.viewerPrevDisplay;
        }
      });
    };
  }, [open]);

  // =========================
  // 全屏打开时直接挂载全部图片容器（图片懒加载）
  // =========================
  const slides = images.map((src, i) => ({
    i,
    src,
    dist: Math.abs(signedDistance(index, i)),
  }));

  // 当索引变化时重新渲染位置（但不破坏动画）
  useEffect(() => {
    render();
  }, [index]);

  // 确保当前图缩略图始终可见，并尽量居中
  useEffect(() => {
    const rail = thumbRailRef.current;
    const activeBtn = thumbBtnRefs.current[index];
    if (!rail || !activeBtn) return;
    const targetLeft = activeBtn.offsetLeft - (rail.clientWidth - activeBtn.offsetWidth) / 2;
    const maxLeft = rail.scrollWidth - rail.clientWidth;
    const nextLeft = clamp(targetLeft, 0, Math.max(maxLeft, 0));
    animateThumbRailTo(rail, nextLeft);
  }, [index, open]);

  useEffect(() => {
    return () => {
      if (thumbAlignRafRef.current) {
        cancelAnimationFrame(thumbAlignRafRef.current);
        thumbAlignRafRef.current = null;
      }
    };
  }, []);

  return (
    <>
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* 主图（非全屏模式） */}
      <div
        onClick={() => setOpen(true)}
        onWheel={(e) => {
          if (open) return;
          e.preventDefault();
          e.stopPropagation();
          inlineWheelBurstCountRef.current += 1;
          inlineWheelDeltaSumRef.current += e.deltaY;
          if (inlineWheelTimerRef.current) window.clearTimeout(inlineWheelTimerRef.current);
          inlineWheelTimerRef.current = window.setTimeout(() => {
            const sum = inlineWheelDeltaSumRef.current;
            inlineWheelBurstCountRef.current = 0;
            inlineWheelDeltaSumRef.current = 0;
            inlineWheelTimerRef.current = null;
            if (Math.abs(sum) < 4) return;
            goByStep(sum >= 0 ? 1 : -1);
          }, 120);
        }}
        style={{
          width: '100%',
          flex: '1 1 auto',
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
          background: '#ffffff',
        }}
      >
        {/* 留白区域使用同图高斯模糊铺底 */}
        <img
          src={mainSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            position: 'absolute',
            inset: '-8%',
            width: '116%',
            height: '116%',
            objectFit: 'cover',
            objectPosition: 'center',
            filter: 'blur(24px)',
            transform: 'scale(1.06)',
            opacity: 0.65,
            userSelect: 'none',
            WebkitUserSelect: 'none',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(243, 244, 246, 0.18)',
            pointerEvents: 'none',
          }}
        />
        <img
          key={mainSrc}
          src={mainSrc}
          alt={title || ''}
          loading="eager"
          draggable={false}
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center',
            display: 'block',
            borderRadius: 16,
            clipPath: 'inset(0 round 16px)',
            animation: `${mainImageAnimName} 280ms cubic-bezier(0.22, 0.61, 0.36, 1)`,
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        />

        {total > 1 && (
          <div
            style={{
              position: 'absolute',
              right: 12,
              bottom: 12,
              zIndex: 3,
              padding: '6px 10px',
              borderRadius: 999,
              background: 'rgba(17, 24, 39, 0.72)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
              pointerEvents: 'none',
              opacity: inlineCounterVisible ? 1 : 0,
              transform: inlineCounterVisible ? 'translateY(0)' : 'translateY(4px)',
              transition: 'opacity 180ms ease, transform 180ms ease',
            }}
          >
            {Math.min(index + 1, total)}/{total}
          </div>
        )}
      </div>

      {/* 缩略图组 */}
      {!hideInlineThumbRail && total > 1 && (
        <div
          data-thumb-rail
          ref={thumbRailRef}
          style={{
            height: 92,
            flex: '0 0 92px',
            padding: '8px 12px',
            borderTop: '1px solid rgba(17,24,39,0.08)',
            background: '#fff',
            overflowX: 'auto',
            overflowY: 'hidden',
            whiteSpace: 'nowrap',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
          onWheel={(e) => {
            e.preventDefault();
            e.currentTarget.scrollLeft += e.deltaY + e.deltaX;
          }}
        >
          {thumbnails.map((thumbSrc, i) => {
            const active = i === index;
            return (
              <button
                key={`${thumbSrc}-${i}`}
                ref={(el) => setThumbRef(el, i)}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = clamp(i, 0, lastIndex);
                  baseIndexRef.current = next;
                  progress.current = 0;
                  velocity.current = 0;
                  setIndex(next);
                  onSelectImage(next);
                }}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 10,
                  border: active ? '2px solid #2563eb' : '2px solid rgba(17,24,39,0.12)',
                  padding: 0,
                  marginRight: 8,
                  overflow: 'hidden',
                  background: '#ffffff',
                  cursor: 'pointer',
                  verticalAlign: 'top',
                  transform: active ? 'translateY(-1px) scale(1.02)' : 'translateY(0) scale(1)',
                  boxShadow: active ? '0 6px 16px rgba(37,99,235,0.24)' : '0 2px 8px rgba(17,24,39,0.08)',
                  transition: 'transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
                }}
                aria-label={`查看第 ${i + 1} 张`}
              >
                <img
                  src={thumbSrc}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    background: '#ffffff',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    pointerEvents: 'none',
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
      <style>{`
[data-thumb-rail]::-webkit-scrollbar{display:none;width:0;height:0}
@keyframes trip-main-image-in-from-right{
  0%{opacity:.42;transform:translateX(28%)}
  60%{opacity:1;transform:translateX(0)}
  100%{opacity:1;transform:translateX(0)}
}
@keyframes trip-main-image-in-from-left{
  0%{opacity:.42;transform:translateX(-28%)}
  60%{opacity:1;transform:translateX(0)}
  100%{opacity:1;transform:translateX(0)}
}
`}</style>
    </div>

      {/* 半全屏查看器：Portal 到 document.body，避免发布弹窗等祖先的 transform 动画使 position:fixed 相对于面板而非视口 */}
      {typeof document !== 'undefined' &&
        open &&
        createPortal(
        <div
          onClick={(e) => {
            // 只在点遮罩空白时处理（避免点图时把刚弹出的气泡清掉）
            if (e.target !== e.currentTarget) return;
            setMenu(null);
            // 点击遮罩：非全屏关闭查看器；全屏仅退出全屏
            if (document.fullscreenElement) {
              try {
                void document.exitFullscreen();
              } catch {
                // ignore
              }
              return;
            }
            setOpen(false);
          }}
          onDoubleClick={async () => {
            // 双击：进入/退出真全屏
            if (singleClickTimerRef.current) {
              window.clearTimeout(singleClickTimerRef.current);
              singleClickTimerRef.current = null;
            }
            setMenu(null);
            try {
              if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
              } else {
                await document.exitFullscreen();
              }
            } catch {
              // ignore
            }
          }}
          onPointerDownCapture={(e) => {
            // 防止点击/关闭时穿透到底层帖子；并在任何交互开始时收起气泡
            e.stopPropagation();
            if (menuRef.current) {
              const t = e.target as Node | null;
              if (t && menuRef.current.contains(t)) return;
            }
            const target = e.target as HTMLElement | null;
            const tapOnImage = Boolean(target && target.closest('[data-media-clip]'));
            if (menu && tapOnImage) {
              // 同一次点击里：只关闭菜单，不要在 click 阶段又重新打开
              closeMenuByImageTapRef.current = true;
            }
            setMenu(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(243, 244, 246, 0.96)',
            backdropFilter: 'blur(14px)',
            zIndex: 10000,
          }}
        >
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              e.preventDefault();
              setMenu(null);
              try {
                if (document.fullscreenElement) {
                  // 真全屏：退出系统全屏，保留查看器
                  await document.exitFullscreen();
                  zoomScaleRef.current = 1;
                  setZoomScale(1);
                } else {
                  // 半全屏：退出查看器，回到帖子页面
                  setOpen(false);
                }
              } catch {
                // ignore
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 1004,
              width: 38,
              height: 38,
              borderRadius: 999,
              border: '1px solid rgba(17, 24, 39, 0.18)',
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(10px)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: '38px',
              textAlign: 'center',
              color: '#111827',
            }}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Close viewer'}
            title={isFullscreen ? '退出全屏' : '关闭查看器'}
          >
            ×
          </button>
          <div
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              zIndex: 1002,
              padding: '6px 10px',
              borderRadius: 999,
              background: 'rgba(17, 24, 39, 0.72)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1,
              pointerEvents: 'none',
            }}
          >
            {Math.min(displayIndex + 1, total)}/{total}
          </div>

          {!disableViewerContextMenu && menu && (
            <div
              ref={menuRef}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                left: menu.x,
                top: menu.y,
                transform: 'translate(-10px, 12px)',
                zIndex: 1003,
                background: 'rgba(17, 24, 39, 0.86)',
                color: '#fff',
                borderRadius: 12,
                padding: 8,
                display: 'flex',
                gap: 8,
                boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <button
                type="button"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
                onClick={async () => {
                  const src = images[menu.imageIndex];
                  try {
                    await navigator.clipboard.writeText(src);
                  } catch {
                    // ignore
                  }
                  setMenu(null);
                }}
              >
                收藏
              </button>
              <button
                type="button"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  const src = images[menu.imageIndex];
                  const a = document.createElement('a');
                  a.href = src;
                  a.download = '';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setMenu(null);
                }}
              >
                下载
              </button>
              <button
                type="button"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: '#fff',
                  padding: '8px 10px',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  const src = images[menu.imageIndex];
                  window.open(`mailto:?subject=Report%20image&body=${encodeURIComponent(src)}`, '_blank');
                  setMenu(null);
                }}
              >
                举报
              </button>
            </div>
          )}
          <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              overflow: 'hidden',
              touchAction: 'pan-y',
              cursor: isFullscreen ? 'zoom-in' : 'grab',
            }}
          >
            {slides.map((slide) => (
              <div
                key={`${slide.i}-${slide.src}`}
                ref={(el) => setRef(el, slide.i)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '90%',      // 主图更宽，竖图仍占满高度
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  willChange: 'transform',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    data-media-clip
                    ref={slide.i === displayIndex ? clipRef : undefined}
                    onClick={(e) => {
                      // 单击图片：只打开气泡菜单
                      e.stopPropagation();
                      if (disableViewerContextMenu) return;
                      if (isFullscreenRef.current) return;
                      if (dragging.current || moved.current) return;
                      if (closeMenuByImageTapRef.current) {
                        closeMenuByImageTapRef.current = false;
                        return;
                      }
                      // 菜单已打开时，再次单击图片仅关闭菜单，不立即重开
                      if (menu) {
                        setMenu(null);
                        return;
                      }
                      if (singleClickTimerRef.current) {
                        window.clearTimeout(singleClickTimerRef.current);
                        singleClickTimerRef.current = null;
                      }
                      const clickX = (e as any).clientX as number;
                      const clickY = (e as any).clientY as number;
                      const imgIndex = clamp(displayIndexRef.current, 0, lastIndex);
                      // 单击延时触发；若期间发生双击则会被取消
                      singleClickTimerRef.current = window.setTimeout(() => {
                        setMenu({ x: clickX, y: clickY, imageIndex: imgIndex });
                        singleClickTimerRef.current = null;
                      }, SINGLE_CLICK_DELAY_MS);
                    }}
                    style={{
                      borderRadius: 16,
                      overflow: 'hidden',
                      clipPath: 'inset(0 round 16px)',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: 'fit-content',
                      height: 'fit-content',
                      transform: slide.i === displayIndex ? `scale(${zoomScale})` : 'scale(1)',
                      transition: isFullscreen ? 'transform 0.06s linear' : undefined,
                    }}
                  >
                    <img
                      src={slide.src}
                      alt={title || ''}
                      draggable={false}
                      loading={slide.dist <= 1 ? 'eager' : 'lazy'}
                      style={{
                        display: 'block',
                        width: 'auto',
                        height: 'auto',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        willChange: 'transform, filter',
                        transition: 'filter 0.2s',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        ,
        document.body
      )}
    </>
  );
}