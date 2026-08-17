import type { DimensionValue, ViewStyle } from 'react-native';

import type {
  OverlayBarPosition,
  ProgrammingOverlayBar,
} from '../types/programming';

const REFERENCE_SHORT_EDGE = 540;
const REFERENCE_LONG_EDGE = 960;
const REFERENCE_TV_SAFE_INSET = 16;
const REFERENCE_TV_LATERAL_SAFE_INSET = 16;
const MAX_BLOCK_CROSS_PADDING_SHARE = 0.15;

export interface OverlayBarInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function getOverlayBarInsets(
  bars: Array<Pick<ProgrammingOverlayBar, 'position' | 'sizePercent'>>,
): OverlayBarInsets {
  return bars.reduce<OverlayBarInsets>(
    (insets, bar) => {
      const edge = bar.position.toLowerCase() as keyof OverlayBarInsets;
      const size = Math.min(40, Math.max(0, bar.sizePercent));

      return {
        ...insets,
        [edge]: Math.max(insets[edge], size),
      };
    },
    { top: 0, right: 0, bottom: 0, left: 0 },
  );
}

export function getMediaFrameStyle(insets: OverlayBarInsets): ViewStyle {
  return {
    top: toPercent(insets.top),
    right: toPercent(insets.right),
    bottom: toPercent(insets.bottom),
    left: toPercent(insets.left),
  };
}

export function getMediaFrameInsets(
  bars: Array<Pick<ProgrammingOverlayBar, 'position' | 'sizePercent'>>,
): OverlayBarInsets {
  if (bars.length !== 2) {
    return createEmptyInsets();
  }

  const horizontalBar = bars.find(isHorizontalBar);
  const verticalBar = bars.find(bar => !isHorizontalBar(bar));

  if (
    !horizontalBar ||
    !verticalBar ||
    Math.abs(horizontalBar.sizePercent - verticalBar.sizePercent) > 0.01
  ) {
    return createEmptyInsets();
  }

  return getOverlayBarInsets(bars);
}

export function getOverlayBarPositionStyle(
  position: OverlayBarPosition,
  sizePercent: number,
  insets: OverlayBarInsets,
): ViewStyle {
  const size = toPercent(sizePercent);

  if (position === 'TOP' || position === 'BOTTOM') {
    return {
      left: 0,
      width: '100%',
      height: size,
      ...(position === 'TOP' ? { top: 0 } : { bottom: 0 }),
    };
  }

  return {
    top: toPercent(insets.top),
    bottom: toPercent(insets.bottom),
    width: size,
    ...(position === 'LEFT' ? { left: 0 } : { right: 0 }),
  };
}

export function getOverlayLayoutScale(width: number, height: number) {
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  const scale = Math.min(
    shortEdge / REFERENCE_SHORT_EDGE,
    longEdge / REFERENCE_LONG_EDGE,
  );

  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function getOverlayBarSafeContentStyle(
  position: OverlayBarPosition,
  layoutScale: number,
): ViewStyle {
  const safeInset = REFERENCE_TV_SAFE_INSET * layoutScale;

  if (position === 'TOP') return { paddingTop: safeInset };
  if (position === 'BOTTOM') return { paddingBottom: safeInset };

  const lateralSafeInset = REFERENCE_TV_LATERAL_SAFE_INSET * layoutScale;

  return {
    paddingLeft: lateralSafeInset,
    paddingRight: lateralSafeInset,
  };
}

export function getOverlayTextBlockPadding(
  position: OverlayBarPosition,
  sizePercent: number,
  paddingHorizontal: number,
  paddingVertical: number,
  layoutScale: number,
) {
  const isHorizontal = position === 'TOP' || position === 'BOTTOM';
  const referenceThickness =
    (isHorizontal ? REFERENCE_SHORT_EDGE : REFERENCE_LONG_EDGE) *
    (Math.min(40, Math.max(0, sizePercent)) / 100);
  const maximumCrossAxisPadding = Math.max(
    0,
    (referenceThickness - REFERENCE_TV_SAFE_INSET) *
      MAX_BLOCK_CROSS_PADDING_SHARE,
  );
  const safeHorizontal = Math.max(0, paddingHorizontal);
  const safeVertical = Math.max(0, paddingVertical);

  return {
    paddingHorizontal:
      (isHorizontal
        ? safeHorizontal
        : Math.min(safeHorizontal, maximumCrossAxisPadding)) * layoutScale,
    paddingVertical:
      (isHorizontal
        ? Math.min(safeVertical, maximumCrossAxisPadding)
        : safeVertical) * layoutScale,
  };
}

export function getOverlayTextOpticalOffsetY(
  position: OverlayBarPosition,
  scaledFontSize: number,
  layoutScale: number,
) {
  if (position === 'LEFT' || position === 'RIGHT') {
    return 0;
  }

  const correction = Math.min(
    Math.max(0, scaledFontSize) * 0.08,
    4 * Math.max(0, layoutScale),
  );

  return -correction;
}

export function shouldAdjustOverlayTextToFit(position: OverlayBarPosition) {
  return position === 'TOP' || position === 'BOTTOM';
}

function toPercent(value: number): DimensionValue {
  return `${Math.max(0, value)}%` as DimensionValue;
}

function isHorizontalBar(bar: Pick<ProgrammingOverlayBar, 'position'>) {
  return bar.position === 'TOP' || bar.position === 'BOTTOM';
}

function createEmptyInsets(): OverlayBarInsets {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}
