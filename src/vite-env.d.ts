/// <reference types="vite/client" />
declare module 'virtual:vocabulary-manifest' { const url: string; export default url; export const teachingIndexUrl: string; }

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}
