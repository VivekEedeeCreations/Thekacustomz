// Ambient shims for build-time config packages that do not ship their own types.
declare module 'tailwindcss-animate' {
  import type { Config } from 'tailwindcss';
  const plugin: NonNullable<Config['plugins']>[number];
  export default plugin;
}
