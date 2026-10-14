import { previewFitPoints, previewPadding } from '../preview-fit';

const me = { lat: 12.97, lng: 77.59 };
const dest = { lat: 12.3, lng: 76.65 };
const road = [me, { lat: 12.6, lng: 77.1 }, dest];

describe('previewPadding', () => {
  it('clears the back button at the top and the panel, air and attribution at the bottom', () => {
    // 360x780: status bar 24, panel 300.
    expect(previewPadding(24, 300)).toEqual({ top: 24 + 8 + 56 + 24, bottom: 300 + 24 + 28, left: 48, right: 48 });
  });
  it('counts a banner above the back button through the top inset', () => {
    expect(previewPadding(24 + 56, 300).top).toBe(previewPadding(24, 300).top + 56);
  });
});

describe('previewFitPoints', () => {
  it('frames the whole road route when there is one', () => {
    expect(previewFitPoints({ coords: road, dashed: false }, me, dest)).toBe(road);
  });
  it('frames me and the destination for the dashed line or while loading', () => {
    expect(previewFitPoints({ coords: [me, dest], dashed: true }, me, dest)).toEqual([me, dest]);
    expect(previewFitPoints(null, me, dest)).toEqual([me, dest]);
  });
  it('has nothing to frame without a start point (the camera sits on the destination)', () => {
    expect(previewFitPoints(null, null, dest)).toEqual([]);
  });
});
