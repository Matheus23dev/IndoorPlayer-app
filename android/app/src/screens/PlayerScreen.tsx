import React from 'react';
import Video from 'react-native-video';

export function PlayerScreen() {
  return (
    <Video
      source={{
        uri: 'https://www.w3schools.com/html/mov_bbb.mp4',
      }}
      style={{
        flex: 1,
      }}
      repeat
      resizeMode="cover"
    />
  );
}