import { Image, StyleSheet, Text, View } from 'react-native';
import type {
  DimensionValue,
  ImageStyle,
  ImageResizeMode,
  StyleProp,
  TextStyle,
  ViewStyle,
} from 'react-native';

import type { ProgrammingOverlayBar } from '../types/programming';
import { useOverlayBarDynamicContent } from '../hooks/useOverlayBarDynamicContent';

interface OverlayBarsLayerProps {
  bars: ProgrammingOverlayBar[];
  style: StyleProp<ViewStyle>;
}

export function OverlayBarsLayer({ bars, style }: OverlayBarsLayerProps) {
  if (bars.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.layer, style]}>
      {bars.map(bar => {
        const isHorizontal =
          bar.position === 'TOP' || bar.position === 'BOTTOM';
        const size = `${bar.sizePercent}%` as DimensionValue;
        const positionStyle: ViewStyle = isHorizontal
          ? {
              left: 0,
              width: '100%',
              height: size,
              ...(bar.position === 'TOP' ? { top: 0 } : { bottom: 0 }),
            }
          : {
              top: 0,
              height: '100%',
              width: size,
              ...(bar.position === 'LEFT' ? { left: 0 } : { right: 0 }),
            };

        return (
          <OverlayBarItem
            key={bar.id}
            bar={bar}
            isHorizontal={isHorizontal}
            positionStyle={positionStyle}
          />
        );
      })}
    </View>
  );
}

interface OverlayBarItemProps {
  bar: ProgrammingOverlayBar;
  isHorizontal: boolean;
  positionStyle: ViewStyle;
}

function OverlayBarItem({
  bar,
  isHorizontal,
  positionStyle,
}: OverlayBarItemProps) {
  const contentItems = useOverlayBarDynamicContent(bar);
  const imageSize = `${bar.imageSizePercent}%` as DimensionValue;
  const barStyle: ViewStyle = {
    backgroundColor: toRgba(bar.backgroundColor, bar.opacity),
  };
  const contentStyle: ViewStyle = {
    flexDirection: isHorizontal ? 'row' : 'column',
    justifyContent: toJustifyContent(bar.contentPosition),
    gap: bar.contentGap,
    ...getOverlayContentInsetStyle(isHorizontal, bar.contentPadding),
  };
  const imageStyle: ImageStyle = isHorizontal
    ? { height: imageSize, aspectRatio: 1, maxWidth: '100%' }
    : { width: imageSize, aspectRatio: 1, maxHeight: '100%' };

  return (
    <View style={[styles.bar, positionStyle, barStyle]}>
      <View style={[styles.content, contentStyle]}>
        {bar.media?.localPath ? (
          <Image
            source={{ uri: bar.media.localPath }}
            style={[styles.image, imageStyle]}
            resizeMode={toResizeMode(bar.fit)}
            fadeDuration={0}
          />
        ) : null}

        {contentItems.map(item => {
          if (item.type === 'SPACER') {
            const spacerStyle: ViewStyle = isHorizontal
              ? { width: item.spacerSize, height: 1, flexShrink: 0 }
              : { height: item.spacerSize, width: 1, flexShrink: 0 };

            return <View key={item.id} style={spacerStyle} />;
          }

          const textStyle: TextStyle = {
            color: item.textColor,
            fontSize: item.fontSize,
            lineHeight: Math.round(item.fontSize * 1.2),
            fontWeight: toFontWeight(item.fontWeight),
            fontFamily: toFontFamily(item.fontFamily),
            fontStyle: item.italic ? 'italic' : 'normal',
            backgroundColor: item.backgroundColor ?? 'transparent',
            padding: item.padding,
            borderRadius: item.borderRadius,
            textAlign: 'center',
            textAlignVertical: 'center',
            includeFontPadding: false,
          };

          return (
            <Text
              key={item.id}
              numberOfLines={isHorizontal ? 2 : 6}
              adjustsFontSizeToFit
              minimumFontScale={0.45}
              style={[styles.text, textStyle]}
            >
              {item.content}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

export function getOverlayContentInsetStyle(
  isHorizontal: boolean,
  contentPadding: number,
): ViewStyle {
  return isHorizontal
    ? { paddingHorizontal: contentPadding }
    : { paddingVertical: contentPadding };
}

function toFontFamily(
  family: ProgrammingOverlayBar['contentItems'][number]['fontFamily'],
): TextStyle['fontFamily'] {
  if (family === 'SANS_SERIF') return 'sans-serif';
  if (family === 'SANS_SERIF_CONDENSED') return 'sans-serif-condensed';
  if (family === 'SERIF') return 'serif';
  if (family === 'MONOSPACE') return 'monospace';
  return undefined;
}

function toFontWeight(
  weight: ProgrammingOverlayBar['contentItems'][number]['fontWeight'],
): TextStyle['fontWeight'] {
  if (weight === 'NORMAL') return '400';
  if (weight === 'SEMIBOLD') return '600';
  return '700';
}

function toJustifyContent(
  position: ProgrammingOverlayBar['contentPosition'],
): ViewStyle['justifyContent'] {
  if (position === 'START') return 'flex-start';
  if (position === 'END') return 'flex-end';
  return 'center';
}

function toResizeMode(fit: ProgrammingOverlayBar['fit']): ImageResizeMode {
  if (fit === 'COVER') {
    return 'cover';
  }

  if (fit === 'FILL') {
    return 'stretch';
  }

  return 'contain';
}

function toRgba(hex: string, opacity: number) {
  const normalized = hex.replace('#', '');
  const safeHex = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : '000000';
  const red = Number.parseInt(safeHex.slice(0, 2), 16);
  const green = Number.parseInt(safeHex.slice(2, 4), 16);
  const blue = Number.parseInt(safeHex.slice(4, 6), 16);
  const alpha = Math.min(100, Math.max(0, opacity)) / 100;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 10,
    elevation: 1,
  },
  bar: {
    position: 'absolute',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    boxSizing: 'border-box',
    overflow: 'hidden',
    alignItems: 'center',
  },
  image: {
    flexShrink: 0,
  },
  text: {
    flexShrink: 1,
    maxWidth: '100%',
    maxHeight: '100%',
    fontWeight: '700',
  },
});
