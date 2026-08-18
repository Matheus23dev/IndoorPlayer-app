import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type {
  DimensionValue,
  ImageStyle,
  ImageResizeMode,
  LayoutChangeEvent,
  StyleProp,
  TextStyle,
  ViewStyle,
} from 'react-native';

import type {
  PlaylistOrientation,
  ProgrammingOverlayBar,
} from '../types/programming';
import { useOverlayBarDynamicContent } from '../hooks/useOverlayBarDynamicContent';
import {
  getOverlayBarInsets,
  getOverlayLateralSafeInset,
  getOverlayBarPositionStyle,
  getOverlayBarSafeContentStyle,
  getOverlayTextOpticalOffsetY,
  getOverlayTextBlockPadding,
  shouldAdjustOverlayTextToFit,
} from '../domain/overlayBarLayout';

interface OverlayBarsLayerProps {
  bars: ProgrammingOverlayBar[];
  style: StyleProp<ViewStyle>;
  layoutScale?: number;
  orientation: PlaylistOrientation;
}

const IMAGE_ANDROID_OPTICAL_CORRECTION = 8;

export function OverlayBarsLayer({
  bars,
  style,
  layoutScale = 1,
  orientation,
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
            orientation={orientation}
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
  orientation: PlaylistOrientation;
}

function OverlayBarItem({
  bar,
  isHorizontal,
  positionStyle,
  layoutScale,
  orientation,
}: OverlayBarItemProps) {
  const [barCrossAxisSize, setBarCrossAxisSize] = useState(0);
  const contentItems = useOverlayBarDynamicContent(bar);
  const imageSafeOffset = getOverlayImageSafeOffset(
    bar.position,
    orientation,
    bar.contentAlignment,
    layoutScale,
  );
  const allowLateralImageOverflow =
    shouldAllowLateralImageOverflow(
      isHorizontal,
      bar.fit,
      bar.imageSizePercent,
    ) ||
    contentItems.some(
      item =>
        item.type === 'IMAGE' &&
        shouldAllowLateralImageOverflow(
          isHorizontal,
          item.fit,
          item.imageSizePercent,
        ),
    );
  const barStyle: ViewStyle = {
    backgroundColor: toRgba(bar.backgroundColor, bar.opacity),
    overflow: allowLateralImageOverflow ? 'visible' : 'hidden',
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
    overflow: allowLateralImageOverflow ? 'visible' : 'hidden',
  };

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        const nextSize = isHorizontal ? height : width;

        setBarCrossAxisSize(currentSize =>
          Math.abs(currentSize - nextSize) < 0.5 ? currentSize : nextSize,
        );
      }}
      style={[styles.bar, positionStyle, barStyle]}
    >
      <View style={[styles.content, contentStyle]}>
        {bar.media?.localPath ? (
          <OverlayContentImage
            uri={bar.media.localPath}
            fit={bar.fit}
            sizePercent={bar.imageSizePercent}
            isHorizontal={isHorizontal}
            alignment={bar.contentAlignment}
            barCrossAxisSize={barCrossAxisSize}
            transform={toImageSafeTransform(imageSafeOffset)}
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

            const transform: ImageStyle['transform'] = [
              {
                translateX:
                  scaleSignedValue(item.offsetX, layoutScale) +
                  imageSafeOffset.x,
              },
              {
                translateY:
                  scaleSignedValue(item.offsetY, layoutScale) +
                  imageSafeOffset.y,
              },
            ];

            return (
              <OverlayContentImage
                key={item.id}
                uri={item.media.localPath}
                fit={item.fit}
                sizePercent={item.imageSizePercent}
                isHorizontal={isHorizontal}
                alignment={bar.contentAlignment}
                barCrossAxisSize={barCrossAxisSize}
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
            width: isHorizontal ? undefined : '100%',
            flexShrink: isHorizontal ? 1 : 0,
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
              adjustsFontSizeToFit={shouldAdjustOverlayTextToFit(bar.position)}
              minimumFontScale={0.2}
              allowFontScaling={false}
              ellipsizeMode="clip"
              textBreakStrategy="simple"
              android_hyphenationFrequency="none"
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
  sizePercent: number;
  isHorizontal: boolean;
  alignment: ProgrammingOverlayBar['contentAlignment'];
  barCrossAxisSize: number;
  transform?: ImageStyle['transform'];
}

function OverlayContentImage({
  uri,
  fit,
  sizePercent,
  isHorizontal,
  alignment,
  barCrossAxisSize,
  transform,
}: OverlayContentImageProps) {
  const [loadedImage, setLoadedImage] = useState({ uri, aspectRatio: 1 });
  const naturalAspectRatio =
    loadedImage.uri === uri ? loadedImage.aspectRatio : 1;
  const size = resolveOverlayImageSize(
    isHorizontal,
    sizePercent,
    barCrossAxisSize,
  );

  const imageStyle: ImageStyle = {
    flexShrink: 0,
    aspectRatio: fit === 'CONTAIN' ? naturalAspectRatio : 1,
    transform,
    ...getOverlayImageSizeStyle(isHorizontal, size),
  };

  const image = (
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

  if (isHorizontal) {
    return image;
  }

  return (
    <View
      style={[
        styles.verticalImageFrame,
        { alignItems: toAlignItems(alignment) },
      ]}
    >
      {image}
    </View>
  );
}

export function getOverlayImageSizeStyle(
  isHorizontal: boolean,
  size: DimensionValue,
): ImageStyle {
  return isHorizontal ? { height: size } : { width: size };
}

export function resolveOverlayImageSize(
  isHorizontal: boolean,
  sizePercent: number,
  barCrossAxisSize: number,
): DimensionValue {
  if (isHorizontal || barCrossAxisSize <= 0) {
    return `${sizePercent}%` as DimensionValue;
  }

  return (barCrossAxisSize * sizePercent) / 100;
}

export function shouldAllowLateralImageOverflow(
  isHorizontal: boolean,
  fit: ProgrammingOverlayBar['fit'],
  sizePercent: number,
) {
  return !isHorizontal && fit === 'CONTAIN' && sizePercent > 100;
}

export function getOverlayImageSafeOffset(
  position: ProgrammingOverlayBar['position'],
  orientation: PlaylistOrientation,
  alignment: ProgrammingOverlayBar['contentAlignment'],
  layoutScale: number,
) {
  if (alignment !== 'CENTER') {
    return { x: 0, y: 0 };
  }

  const opticalCorrection =
    IMAGE_ANDROID_OPTICAL_CORRECTION * Math.max(0, layoutScale);
  const safeOffset =
    getOverlayLateralSafeInset(layoutScale) + opticalCorrection;

  if (orientation === 'PORTRAIT') {
    if (position === 'TOP') {
      return { x: 0, y: safeOffset };
    }

    if (position === 'BOTTOM') {
      return { x: 0, y: -safeOffset };
    }

    return { x: 0, y: 0 };
  }

  if (position === 'LEFT') {
    return { x: safeOffset, y: 0 };
  }

  if (position === 'RIGHT') {
    return { x: -safeOffset, y: 0 };
  }

  return { x: 0, y: 0 };
}

function toImageSafeTransform(offset: { x: number; y: number }) {
  if (offset.x === 0 && offset.y === 0) {
    return undefined;
  }

  return [{ translateX: offset.x }, { translateY: offset.y }];
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
  verticalImageFrame: {
    alignSelf: 'stretch',
    alignItems: 'center',
    flexShrink: 0,
  },
  text: {
    flexShrink: 1,
    maxWidth: '100%',
    maxHeight: '100%',
    fontWeight: '700',
  },
});
