import { useState } from 'react';
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
import {
  getOverlayBarInsets,
  getOverlayBarPositionStyle,
  getOverlayBarSafeContentStyle,
  getOverlayTextOpticalOffsetY,
  getOverlayTextBlockPadding,
} from '../domain/overlayBarLayout';

interface OverlayBarsLayerProps {
  bars: ProgrammingOverlayBar[];
  style: StyleProp<ViewStyle>;
  layoutScale?: number;
}

export function OverlayBarsLayer({
  bars,
  style,
  layoutScale = 1,
}: OverlayBarsLayerProps) {
  if (bars.length === 0) {
    return null;
  }

  const insets = getOverlayBarInsets(bars);

  return (
    <View pointerEvents="none" style={[styles.layer, style]}>
      {bars.map(bar => {
        const isHorizontal =
          bar.position === 'TOP' || bar.position === 'BOTTOM';
        const positionStyle = getOverlayBarPositionStyle(
          bar.position,
          bar.sizePercent,
          insets,
        );

        return (
          <OverlayBarItem
            key={bar.id}
            bar={bar}
            isHorizontal={isHorizontal}
            positionStyle={positionStyle}
            layoutScale={layoutScale}
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
  layoutScale: number;
}

function OverlayBarItem({
  bar,
  isHorizontal,
  positionStyle,
  layoutScale,
}: OverlayBarItemProps) {
  const contentItems = useOverlayBarDynamicContent(bar);
  const imageSize = `${bar.imageSizePercent}%` as DimensionValue;
  const barStyle: ViewStyle = {
    backgroundColor: toRgba(bar.backgroundColor, bar.opacity),
  };
  const contentStyle: ViewStyle = {
    flexDirection: isHorizontal ? 'row' : 'column',
    justifyContent: toJustifyContent(bar.contentPosition),
    alignItems: toAlignItems(bar.contentAlignment),
    gap: scaleValue(bar.contentGap, layoutScale),
    ...getOverlayContentInsetStyle(
      isHorizontal,
      scaleValue(bar.contentPadding, layoutScale),
    ),
    ...getOverlayBarSafeContentStyle(bar.position, layoutScale),
  };

  return (
    <View style={[styles.bar, positionStyle, barStyle]}>
      <View style={[styles.content, contentStyle]}>
        {bar.media?.localPath ? (
          <OverlayContentImage
            uri={bar.media.localPath}
            fit={bar.fit}
            size={imageSize}
            isHorizontal={isHorizontal}
          />
        ) : null}

        {contentItems.map(item => {
          if (item.type === 'SPACER') {
            const spacerSize = scaleValue(item.spacerSize, layoutScale);
            const spacerStyle: ViewStyle = isHorizontal
              ? { width: spacerSize, height: 1, flexShrink: 0 }
              : { height: spacerSize, width: 1, flexShrink: 0 };

            return <View key={item.id} style={spacerStyle} />;
          }

          if (item.type === 'IMAGE') {
            if (!item.media?.localPath) {
              return null;
            }

            const contentImageSize =
              `${item.imageSizePercent}%` as DimensionValue;
            const transform: ImageStyle['transform'] = [
              {
                translateX: scaleSignedValue(item.offsetX, layoutScale),
              },
              {
                translateY: scaleSignedValue(item.offsetY, layoutScale),
              },
            ];

            return (
              <OverlayContentImage
                key={item.id}
                uri={item.media.localPath}
                fit={item.fit}
                size={contentImageSize}
                isHorizontal={isHorizontal}
                transform={transform}
              />
            );
          }

          const fontSize = scaleValue(item.fontSize, layoutScale);
          const blockPadding = getOverlayTextBlockPadding(
            bar.position,
            bar.sizePercent,
            item.paddingHorizontal,
            item.paddingVertical,
            layoutScale,
          );
          const textStyle: TextStyle = {
            color: item.textColor,
            fontSize,
            fontWeight: toFontWeight(item.fontWeight),
            fontFamily: toFontFamily(item.fontFamily),
            fontStyle: item.italic ? 'italic' : 'normal',
            backgroundColor: item.backgroundColor ?? 'transparent',
            paddingHorizontal: blockPadding.paddingHorizontal,
            paddingVertical: blockPadding.paddingVertical,
            borderRadius: scaleValue(item.borderRadius, layoutScale),
            textAlign: 'center',
            textAlignVertical: 'center',
            includeFontPadding: false,
            transform: [
              {
                translateX: scaleSignedValue(item.offsetX, layoutScale),
              },
              {
                translateY:
                  scaleSignedValue(item.offsetY, layoutScale) +
                  getOverlayTextOpticalOffsetY(
                    bar.position,
                    fontSize,
                    layoutScale,
                  ),
              },
            ],
          };

          return (
            <Text
              key={item.id}
              numberOfLines={isHorizontal ? 2 : 6}
              adjustsFontSizeToFit
              minimumFontScale={0.2}
              allowFontScaling={false}
              ellipsizeMode="clip"
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

interface OverlayContentImageProps {
  uri: string;
  fit: ProgrammingOverlayBar['fit'];
  size: DimensionValue;
  isHorizontal: boolean;
  transform?: ImageStyle['transform'];
}

function OverlayContentImage({
  uri,
  fit,
  size,
  isHorizontal,
  transform,
}: OverlayContentImageProps) {
  const [loadedImage, setLoadedImage] = useState({ uri, aspectRatio: 1 });
  const naturalAspectRatio =
    loadedImage.uri === uri ? loadedImage.aspectRatio : 1;

  const imageStyle: ImageStyle = {
    flexShrink: 0,
    aspectRatio: fit === 'CONTAIN' ? naturalAspectRatio : 1,
    transform,
    ...(isHorizontal
      ? { height: size, maxWidth: '100%' }
      : { width: size, maxHeight: '100%' }),
  };

  return (
    <Image
      source={{ uri }}
      style={imageStyle}
      resizeMode={toResizeMode(fit)}
      resizeMethod="scale"
      fadeDuration={0}
      onLoad={event => {
        const { width, height } = event.nativeEvent.source;

        if (width > 0 && height > 0) {
          setLoadedImage({ uri, aspectRatio: width / height });
        }
      }}
    />
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

function toAlignItems(
  position: ProgrammingOverlayBar['contentAlignment'],
): ViewStyle['alignItems'] {
  if (position === 'START') return 'flex-start';
  if (position === 'END') return 'flex-end';
  return 'center';
}

function scaleValue(value: number, layoutScale: number) {
  return Math.max(0, value * layoutScale);
}

function scaleSignedValue(value: number, layoutScale: number) {
  return value * layoutScale;
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
