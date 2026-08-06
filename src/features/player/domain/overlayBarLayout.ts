import type { DimensionValue, ViewStyle } from 'react-native';

import type {
  OverlayBarPosition,
  ProgrammingOverlayBar,
} from '../types/programming';

const REFERENCE_SHORT_EDGE = 540;
const REFERENCE_LONG_EDGE = 960;

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

function toPercent(value: number): DimensionValue {
  return `${Math.max(0, value)}%` as DimensionValue;
}
