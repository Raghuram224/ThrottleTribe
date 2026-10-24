import { useSosStore } from '@/store/sos-store';

jest.mock('@/lib/emergency-contacts-api', () => ({ listMyContacts: jest.fn() }));
jest.mock('@/lib/ride-api', () => ({ setSos: jest.fn(), toRideError: () => ({ code: 'unknown' }) }));
jest.mock('@/store/toast-store', () => ({ showToast: jest.fn() }));

describe('sos store reset', () => {
  it('keeps my emergency contacts across a ride reset and drops them on clearContacts', () => {
    const rows = [{ id: 'c1' }] as never;
    useSosStore.getState().setMyContacts(rows);
    useSosStore.getState().dismiss('u:1');
    useSosStore.getState().reset();
    expect(useSosStore.getState().dismissed).toEqual({});
    expect(useSosStore.getState().myContactsLoaded).toBe(true);
    expect(useSosStore.getState().myContacts).toHaveLength(1);
    useSosStore.getState().clearContacts();
    expect(useSosStore.getState().myContactsLoaded).toBe(false);
    expect(useSosStore.getState().myContacts).toHaveLength(0);
  });
});
