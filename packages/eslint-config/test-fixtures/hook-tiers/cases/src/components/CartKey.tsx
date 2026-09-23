import type { QueryKey } from '@tanstack/react-query'

export function CartKey({ queryKey }: { queryKey: QueryKey }): React.ReactNode {
  return <code>{JSON.stringify(queryKey)}</code>
}
