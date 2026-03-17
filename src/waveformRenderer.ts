import type WaveSurfer from "wavesurfer.js";
import type { WaveSurferOptions } from "wavesurfer.js";
import {
  calculateBarRenderConfig,
  calculateBarSegments,
  calculateVerticalScale,
} from "wavesurfer.js/dist/renderer-utils.js";

export interface WaveformRenderRefs {
  selection: React.RefObject<{ start: number; end: number } | null>;
  duration: React.RefObject<number>;
  selectionWaveColor: React.RefObject<string>;
  waveColor: React.RefObject<string>;
  ws: React.RefObject<WaveSurfer | null>;
}

/**
 * Creates a WaveSurfer `renderFunction` that draws bars with a gradient
 * to highlight the selection region in a different color.
 */
export function createWaveformRenderer(
  refs: WaveformRenderRefs,
  wsOptions: WaveSurferOptions,
) {
  return (
    peaks: Array<Float32Array | number[]>,
    ctx: CanvasRenderingContext2D,
  ) => {
    const sel = refs.selection.current;
    const dur = refs.duration.current;
    const selColor = refs.selectionWaveColor.current;
    const baseColor = refs.waveColor.current;

    // If there's a selection with a distinct color, apply a gradient
    if (sel && dur > 0 && selColor !== baseColor) {
      applySelectionGradient(ctx, sel, dur, selColor, baseColor, refs.ws);
    }

    // Draw bars using WaveSurfer utilities
    drawBars(peaks, ctx, wsOptions);
  };
}

/**
 * Applies a horizontal gradient to `ctx.fillStyle` so that bars inside the
 * selection region use `selColor` and bars outside use `baseColor`.
 * Accounts for zoom by mapping the selection to the canvas chunk's local
 * coordinate space.
 */
function applySelectionGradient(
  ctx: CanvasRenderingContext2D,
  sel: { start: number; end: number },
  duration: number,
  selColor: string,
  baseColor: string,
  wsRef: React.RefObject<WaveSurfer | null>,
) {
  // When zoomed, WaveSurfer splits into multiple canvas chunks.
  // Map selection time range to this chunk's local [0,1] fraction.
  const canvasOffsetCSS = parseFloat(ctx.canvas.style.left) || 0;
  const canvasWidthCSS =
    parseFloat(ctx.canvas.style.width) || ctx.canvas.width;
  const wrapper = wsRef.current?.getWrapper();
  const totalWidthCSS = wrapper?.scrollWidth || canvasWidthCSS;

  const selStartGlobal = sel.start / duration;
  const selEndGlobal = sel.end / duration;

  const chunkStart = canvasOffsetCSS / totalWidthCSS;
  const chunkSpan = canvasWidthCSS / totalWidthCSS;

  // Selection edges as fractions within this canvas chunk
  const localStart = (selStartGlobal - chunkStart) / chunkSpan;
  const localEnd = (selEndGlobal - chunkStart) / chunkSpan;

  // Only apply gradient if selection overlaps this chunk
  if (localEnd <= 0 || localStart >= 1) return;

  const eps = 0.0001;
  const gradient = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
  const s = Math.max(0, localStart);
  const e = Math.min(1, localEnd);

  if (s > eps) {
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(s - eps, baseColor);
  }
  gradient.addColorStop(s, selColor);
  gradient.addColorStop(e, selColor);
  if (e < 1 - eps) {
    gradient.addColorStop(e + eps, baseColor);
    gradient.addColorStop(1, baseColor);
  }

  ctx.fillStyle = gradient;
}

/**
 * Draws waveform bars using WaveSurfer's exported utilities.
 */
function drawBars(
  peaks: Array<Float32Array | number[]>,
  ctx: CanvasRenderingContext2D,
  options: WaveSurferOptions,
) {
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const { width, height } = ctx.canvas;

  const vScale = calculateVerticalScale({
    channelData: peaks,
    normalize: options.normalize,
  });
  const config = calculateBarRenderConfig({
    width,
    height,
    length: (peaks[0] || []).length,
    options,
    pixelRatio,
  });
  const segments = calculateBarSegments({
    channelData: peaks,
    barIndexScale: config.barIndexScale,
    barSpacing: config.barSpacing,
    barWidth: config.barWidth,
    halfHeight: config.halfHeight,
    vScale,
    canvasHeight: height,
    barAlign: undefined,
    barMinHeight: config.barMinHeight,
  });

  ctx.beginPath();
  for (const seg of segments) {
    ctx.rect(seg.x, seg.y, seg.width, seg.height);
  }
  ctx.fill();
  ctx.closePath();
}

/**
 * Injects a `<style>` into WaveSurfer's shadow DOM to disable the
 * progress/clip-path split. Without this, `renderProgress` clip-paths the
 * canvasWrapper each frame, causing color artifacts.
 */
export function disableProgressSplit(ws: WaveSurfer) {
  const shadowRoot = ws.getWrapper().getRootNode() as ShadowRoot;
  const style = document.createElement("style");
  style.textContent =
    ".canvases { clip-path: none !important; } .progress { display: none !important; }";
  shadowRoot.appendChild(style);
}
