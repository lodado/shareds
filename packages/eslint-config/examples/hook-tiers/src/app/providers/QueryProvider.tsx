import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const client = new QueryClient()

export function QueryProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
