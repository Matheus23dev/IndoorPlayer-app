import { useEffect, useMemo, useState } from 'react';

import { api } from '../../../core/api/client';
import type {
  ProgrammingOverlayBar,
  ProgrammingOverlayBarContentItem,
} from '../types/programming';

export interface ResolvedOverlayBarContentItem
  extends ProgrammingOverlayBarContentItem {
  content: string;
}

interface WeatherSnapshot {
  location: string;
  temperature: string;
  condition: string;
  attribution: string;
  updatedAt: string;
}

const WEATHER_REFRESH_MS = 15 * 60_000;
const weatherCache = new Map<string, WeatherSnapshot>();

export function useOverlayBarDynamicContent(bar: ProgrammingOverlayBar) {
  const [now, setNow] = useState(() => new Date());
  const weatherLocation = bar.weatherLocation?.trim() ?? '';
  const needsWeather =
    bar.widgetType === 'WEATHER' ||
    /{{(?:temperatura|clima|cidade)}}/.test(bar.textContent ?? '') ||
    bar.contentItems.some(
      item =>
        item.type === 'WEATHER' ||
        /{{(?:temperatura|clima|cidade)}}/.test(item.text ?? ''),
    );
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() =>
    weatherLocation
      ? weatherCache.get(weatherLocation.toLowerCase()) ?? null
      : null,
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!needsWeather || !weatherLocation) {
      return;
    }

    let active = true;

    const refresh = async () => {
      try {
        const nextWeather = await loadWeather(weatherLocation);

        if (active) {
          setWeather(nextWeather);
        }
      } catch (error) {
        console.log('[OVERLAY BAR] Falha ao atualizar clima:', {
          location: weatherLocation,
          error,
        });
      }
    };

    void refresh();
    const timer = setInterval(() => void refresh(), WEATHER_REFRESH_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [needsWeather, weatherLocation]);

  return useMemo(() => {
    const clock = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    const date = new Intl.DateTimeFormat('pt-BR').format(now);
    const weekday = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
    }).format(now);
    const temperature = weather?.temperature ?? '--°C';
    const condition = weather?.condition ?? 'Clima indisponível';
    const location = weather?.location ?? weatherLocation;
    const weatherText = `${temperature} · ${condition}${
      location ? ` · ${location}` : ''
    }${weather?.attribution ? ` · Dados: ${weather.attribution}` : ''}`;
    const sourceItems =
      bar.contentItems.length > 0 ? bar.contentItems : createLegacyItems(bar);

    return sourceItems.map<ResolvedOverlayBarContentItem>(item => {
      let content = '';

      if (item.type === 'TEXT') {
        content = resolveTemplate(item.text ?? '', {
          clock,
          date,
          weekday,
          temperature,
          condition,
          location,
        });
      } else if (item.type === 'CLOCK') {
        content = clock;
      } else if (item.type === 'DATE') {
        content = date;
      } else if (item.type === 'WEATHER') {
        content = weatherText;
      }

      return {
        ...item,
        content,
      };
    });
  }, [bar, now, weather, weatherLocation]);
}

function createLegacyItems(
  bar: ProgrammingOverlayBar,
): ProgrammingOverlayBarContentItem[] {
  const items: ProgrammingOverlayBarContentItem[] = [];
  const baseStyle = {
    textColor: bar.textColor,
    fontSize: bar.fontSize,
    fontWeight: 'BOLD' as const,
    fontFamily: 'SYSTEM' as const,
    italic: false,
    backgroundColor: null,
    padding: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    spacerSize: 24,
  };

  if (bar.textContent) {
    items.push({
      id: 'legacy-text',
      type: 'TEXT',
      text: bar.textContent,
      ...baseStyle,
    });
  }

  if (bar.widgetType !== 'NONE') {
    items.push({
      id: 'legacy-widget',
      type: bar.widgetType,
      text: null,
      ...baseStyle,
    });
  }

  return items;
}

interface TemplateValues {
  clock: string;
  date: string;
  weekday: string;
  temperature: string;
  condition: string;
  location: string;
}

function resolveTemplate(template: string, values: TemplateValues) {
  return template
    .replace(/{{hora}}/g, values.clock)
    .replace(/{{data}}/g, values.date)
    .replace(/{{dia_semana}}/g, values.weekday)
    .replace(/{{temperatura}}/g, values.temperature)
    .replace(/{{clima}}/g, values.condition)
    .replace(/{{cidade}}/g, values.location);
}

async function loadWeather(location: string) {
  const cacheKey = location.toLowerCase();
  const response = await api.get<WeatherSnapshot>('/weather/current', {
    params: {
      location,
    },
    timeout: 15_000,
  });
  const snapshot = response.data;

  weatherCache.set(cacheKey, snapshot);

  return snapshot;
}
