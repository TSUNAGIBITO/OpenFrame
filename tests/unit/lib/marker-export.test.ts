// tsunagu-review-markers v1 は TsunaguEditor 側のパーサと約束したワイヤ形式。
// 形が変わると編集側の取り込みが黙って壊れるので、ビルダー単体で固定する。

import { describe, it, expect } from 'vitest';
import { buildReviewMarkersPayload, type MarkerSourceComment } from '@/lib/marker-export';

const meta = {
  videoTitle: 'PV第2稿',
  videoId: 'vid_1',
  projectId: 'prj_1',
  versionNumber: 3,
  versionLabel: 'Review Draft',
};

function comment(overrides: Partial<MarkerSourceComment> = {}): MarkerSourceComment {
  return {
    id: 'cmt_1',
    content: 'ここのテロップを大きく',
    timestamp: 12.5,
    timestampEnd: null,
    isResolved: false,
    voiceUrl: null,
    imageUrl: null,
    author: { name: '川上' },
    guestName: null,
    tag: { name: '修正', color: '#ff0000' },
    ...overrides,
  };
}

describe('buildReviewMarkersPayload', () => {
  it('emits the v1 envelope with video meta and reviewUrl', () => {
    const payload = buildReviewMarkersPayload([comment()], meta);
    expect(payload.format).toBe('tsunagu-review-markers');
    expect(payload.formatVersion).toBe(1);
    expect(payload.video.versionNumber).toBe(3);
    expect(payload.video.reviewUrl).toContain('/projects/prj_1/videos/vid_1');
    expect(payload.markers).toHaveLength(1);
    expect(payload.markers[0]).toMatchObject({
      id: 'cmt_1',
      time: 12.5,
      timeEnd: null,
      text: 'ここのテロップを大きく',
      author: '川上',
      tag: '修正',
      color: '#ff0000',
      resolved: false,
    });
  });

  it('expands mentions and falls back for media-only comments', () => {
    const payload = buildReviewMarkersPayload([
      comment({ content: '@[又多](user:usr_1) ここ確認して' }),
      comment({ content: '', voiceUrl: 'https://example.com/v.mp3' }),
      comment({ content: null, voiceUrl: null, imageUrl: 'https://example.com/i.png' }),
      comment({ content: '  ', voiceUrl: null, imageUrl: null }),
    ], meta);
    expect(payload.markers.map((m) => m.text)).toEqual([
      '@又多 ここ確認して',
      '(音声コメント)',
      '(画像コメント)',
      '(注釈)',
    ]);
  });

  it('carries each comment id so a reply can target it', () => {
    const payload = buildReviewMarkersPayload(
      [comment({ id: 'cmt_a' }), comment({ id: 'cmt_b' })],
      meta
    );
    expect(payload.markers.map((m) => m.id)).toEqual(['cmt_a', 'cmt_b']);
  });

  it('uses guestName then 匿名 when there is no author', () => {
    const payload = buildReviewMarkersPayload([
      comment({ author: null, guestName: 'ゲストA' }),
      comment({ author: { name: null }, guestName: null }),
    ], meta);
    expect(payload.markers.map((m) => m.author)).toEqual(['ゲストA', '匿名']);
  });
});
