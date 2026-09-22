import { fileURLToPath } from 'node:url'

export default {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)),
  roots: [{ path: 'src', layers: { views: 'pages' } }],
  rendering: ['src/**/ui/**/*.{ts,tsx}'],
  viewHooks: ['src/features/users/ui/useFocus.ts'],
  server: ['src/app/page.tsx', 'src/app/api/**/route.ts'],
  reasons: { viewHooks: 'DOM-only focus lifecycle', server: 'Approved Next server execution owners' },
  modules: [
    { source: 'zustand', exports: ['create', 'useStore'], kind: 'store' },
    { source: 'react-hook-form', exports: ['useForm', 'useFormContext'], kind: 'orchestration' },
    { source: 'next/navigation', exports: ['useRouter', 'useSearchParams'], kind: 'orchestration' },
  ],
}
