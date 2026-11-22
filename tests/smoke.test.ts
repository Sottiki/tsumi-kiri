import { describe, expect, it } from 'vitest';

// 段階1で core のテストに置き換える。テストの仕組みが動くことだけを確かめる
describe('テストの仕組み', () => {
  it('動く', () => {
    expect(1 + 1).toBe(2);
  });
});
