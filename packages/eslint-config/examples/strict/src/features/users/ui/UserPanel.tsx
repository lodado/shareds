'use client'

import { useUsers } from '../model/useUsers'

export function UserPanel(): React.ReactNode {
  const { count, refresh } = useUsers()
  return <button type="button" onClick={() => { refresh().catch((error: unknown) => console.error(error)) }}>{count}</button>
}
