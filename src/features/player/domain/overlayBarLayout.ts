import type { DimensionValue, ViewStyle } from 'react-native';

import type {
  OverlayBarPosition,
  ProgrammingOverlayBar,
} from '../types/programming';

const REFERENCE_SHORT_EDGE = 540;
const REFERENCE_LONG_EDGE = 960;
const REFERENCE_TV_SAFE_INSET = 16;
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
  if (position === 'LEFT') return { paddingLeft: safeInset };
  return { paddingRight: safeInset };
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

function toPercent(value: number): DimensionValue {
  return `${Math.max(0, value)}%` as DimensionValue;
}
