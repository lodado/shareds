import { useQuery } from '@tanstack/react-query'
import { getProfile } from '../../api/getProfile'
import { useFlag } from './useFlag/useFlag'

export function useMixed(): { name: string, on: boolean } {
  const flag = useFlag()
  const query = useQuery({ queryKey: ['mixed'], queryFn: ({ signal }) => getProfile(signal) })
  return { name: query.data ?? '', on: flag.on }
}
