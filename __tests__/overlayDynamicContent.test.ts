import { addDateBreakOpportunities } from '../src/features/player/hooks/useOverlayBarDynamicContent';

describe('conteúdo dinâmico das barras', () => {
  test('permite quebrar datas nas barras estreitas sem alterar o texto visível', () => {
    expect(addDateBreakOpportunities('06/08/2026')).toBe(
      '06/\u200B08/\u200B2026',
    );
  });
});
