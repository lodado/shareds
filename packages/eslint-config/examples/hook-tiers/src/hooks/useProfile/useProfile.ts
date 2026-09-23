import { useQuery } from '@tanstack/react-query'
import { getProfile } from '../../api/getProfile'

export function useProfile(): { name: string, loading: boolean } {
  const query = useQuery({ queryKey: ['profile'], queryFn: ({ signal }) => getProfile(signal) })
  return { name: query.data ?? '', loading: query.isPending }
}
