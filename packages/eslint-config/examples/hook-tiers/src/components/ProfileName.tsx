import { useProfile } from '../hooks/useProfile'

export function ProfileName(): React.ReactNode {
  const { name, loading } = useProfile()
  if (loading) return <span aria-busy="true">…</span>
  return <span>{name}</span>
}
