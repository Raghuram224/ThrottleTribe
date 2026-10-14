import { createVoiceBlockSync } from '../voice-block-sync';

const on = { voiceOn: true, mySosOn: false, sosHolding: false, receivedSos: false };

describe('createVoiceBlockSync (M4)', () => {
  it('applies the blocked flag from the stores', () => {
    const apply = jest.fn();
    createVoiceBlockSync(() => on, apply, jest.fn())();
    expect(apply).toHaveBeenCalledWith(false);
    createVoiceBlockSync(() => ({ ...on, receivedSos: true }), apply, jest.fn())();
    expect(apply).toHaveBeenLastCalledWith(true);
  });

  it('a throwing engine never propagates into the store update that triggered it', () => {
    const onError = jest.fn();
    const sync = createVoiceBlockSync(
      () => on,
      () => {
        throw new Error('voice bug');
      },
      onError,
    );
    expect(() => sync()).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('a throwing read of a store is contained as well, and so is a throwing reporter', () => {
    const sync = createVoiceBlockSync(
      () => {
        throw new Error('store');
      },
      jest.fn(),
      () => {
        throw new Error('reporter');
      },
    );
    expect(() => sync()).not.toThrow();
  });
});
