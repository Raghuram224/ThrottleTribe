import { parsePreviewParams, previewHref } from '../preview-params';

const place = { id: 'N123', name: 'Café & Bar, MG Road', address: 'MG Road, Bengaluru', lat: 12.9716, lng: 77.5946, category: 'cafe' as const };

describe('preview params', () => {
  it('round-trips a place, including characters that need escaping', () => {
    const url = previewHref(place);
    expect(url.startsWith('/route-preview?')).toBe(true);
    const params = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
    expect(parsePreviewParams(params)).toEqual(place);
  });
  it('takes the first value of a repeated param', () => {
    expect(parsePreviewParams({ name: ['A', 'B'], lat: '1', lng: '2' })?.name).toBe('A');
  });
  it('rejects a missing name or bad coordinates', () => {
    expect(parsePreviewParams({ lat: '1', lng: '2' })).toBeNull();
    expect(parsePreviewParams({ name: 'A', lat: 'x', lng: '2' })).toBeNull();
    expect(parsePreviewParams({ name: 'A', lat: '91', lng: '2' })).toBeNull();
    expect(parsePreviewParams({ name: 'A', lat: '1', lng: '181' })).toBeNull();
    expect(parsePreviewParams({ name: 'A', lat: '', lng: '' })).toBeNull();
  });
  it('falls back to category other and a coordinate id', () => {
    expect(parsePreviewParams({ name: 'A', lat: '1', lng: '2', category: 'zoo' })).toMatchObject({ category: 'other', id: '1.000000,2.000000' });
  });
});
