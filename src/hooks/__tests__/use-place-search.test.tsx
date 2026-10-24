import { useEffect } from 'react';
import { act, create } from 'react-test-renderer';

import { usePlaceSearch, type PlaceSearchState } from '../use-place-search';

const mockSearch = jest.fn();
jest.mock('@/lib/place-search', () => ({
  ...jest.requireActual('@/lib/place-search'),
  searchPlacesDetailed: (...a: unknown[]) => mockSearch(...a),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const here = { lat: 13.08, lng: 80.27 };
const out = { places: [], provider: 'photon' as const, radiusM: 25000 };

const seen: { latest: { state: PlaceSearchState; stillLocating: boolean; setChip: (k: 'fuel' | null) => void; setText: (t: string) => void } | null } = { latest: null };
function Probe(props: { me: typeof here | null; chip?: 'fuel'; text?: string; canLocate?: boolean }) {
  const value = usePlaceSearch(props.me, { chip: props.chip ?? null, text: props.text }, false, props.canLocate ?? true);
  // Handed out after render: the tests read the latest value.
  useEffect(() => {
    seen.latest = value;
  });
  return null;
}

async function flush() {
  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSearch.mockReset();
  mockSearch.mockResolvedValue(out);
});
afterEach(() => jest.useRealTimers());

describe('usePlaceSearch: chips need a position', () => {
  it('waits ("locating") with no request, then runs the chip once the first fix arrives', async () => {
    let r!: ReturnType<typeof create>;
    await act(async () => {
      r = create(<Probe me={null} chip="fuel" />);
    });
    await flush();
    expect(seen.latest?.state).toEqual({ status: 'locating' });
    expect(mockSearch).not.toHaveBeenCalled();

    await act(async () => r.update(<Probe me={here} chip="fuel" />));
    await flush();
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch.mock.calls[0][0].me).toEqual(here);
    expect(seen.latest?.state.status).toBe('results');
  });

  it('does not search again when the position only moves', async () => {
    let r!: ReturnType<typeof create>;
    await act(async () => {
      r = create(<Probe me={here} chip="fuel" />);
    });
    await flush();
    await act(async () => r.update(<Probe me={{ lat: 13.09, lng: 80.28 }} chip="fuel" />));
    await flush();
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('asks to allow location when it cannot arrive by itself', async () => {
    await act(async () => {
      create(<Probe me={null} chip="fuel" canLocate={false} />);
    });
    await flush();
    expect(seen.latest?.state).toEqual({ status: 'needsLocation' });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('typed search still runs without a position', async () => {
    await act(async () => {
      create(<Probe me={null} />);
    });
    await act(async () => seen.latest?.setText('mysuru palace'));
    await flush();
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch.mock.calls[0][0].me).toBeNull();
  });

  it('typed results are not fetched again when the first fix arrives, nor when canLocate changes', async () => {
    let r!: ReturnType<typeof create>;
    await act(async () => {
      r = create(<Probe me={null} text="mysuru palace" />);
    });
    await flush();
    expect(mockSearch).toHaveBeenCalledTimes(1);
    await act(async () => r.update(<Probe me={here} text="mysuru palace" />));
    await flush();
    await act(async () => r.update(<Probe me={here} text="mysuru palace" canLocate={false} />));
    await flush();
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('a chip re-runs when it goes from needing location to having it', async () => {
    let r!: ReturnType<typeof create>;
    await act(async () => {
      r = create(<Probe me={null} chip="fuel" canLocate={false} />);
    });
    await flush();
    await act(async () => r.update(<Probe me={here} chip="fuel" canLocate={false} />));
    await flush();
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('after 15 s without a fix says it is still looking, and stays gated (no request)', async () => {
    await act(async () => {
      create(<Probe me={null} chip="fuel" />);
    });
    await act(async () => {
      jest.advanceTimersByTime(14_000);
    });
    expect(seen.latest?.stillLocating).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(1_500);
    });
    expect(seen.latest?.stillLocating).toBe(true);
    expect(seen.latest?.state).toEqual({ status: 'locating' });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('the slow line goes away once the fix arrives', async () => {
    let r!: ReturnType<typeof create>;
    await act(async () => {
      r = create(<Probe me={null} chip="fuel" />);
    });
    await act(async () => {
      jest.advanceTimersByTime(16_000);
    });
    await act(async () => r.update(<Probe me={here} chip="fuel" />));
    await flush();
    expect(seen.latest?.stillLocating).toBe(false);
  });
});
