import { expect, test, vi } from 'vitest';
import { beginAccountLoad, resetAccountIdentity, setAccountIdentity } from './accountIdentity';
import { putAudio } from './audio';
const mocks = vi.hoisted(() => ({ session: null as Promise<any> | null, upload: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock('../lib/supabase', () => ({ supabaseConfigured: () => true, getSupabase: () => ({ auth: { getSession: () => mocks.session }, storage: { from: () => ({ upload: mocks.upload }) } }) }));
test('raw audio cannot upload under a new owner after delayed auth lookup', async () => {
  resetAccountIdentity(); setAccountIdentity('owner-a'); beginAccountLoad();
  let release!: (result: any) => void; mocks.session = new Promise(resolve => { release = resolve; });
  const upload = putAudio('audio', new Blob(['private recording']), 'owner-a');
  setAccountIdentity('owner-b'); beginAccountLoad();
  release({ data: { session: { user: { id: 'owner-b' } } } });
  await expect(upload).rejects.toThrow('Account changed');
  expect(mocks.upload).not.toHaveBeenCalled();
  resetAccountIdentity();
});
