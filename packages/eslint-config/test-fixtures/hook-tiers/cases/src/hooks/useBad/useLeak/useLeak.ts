import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useBad } from '../useBad'

export function useLeak(): string {
  const form = useForm()
  const query = useQuery({ queryKey: ['leak'], queryFn: async () => (await fetch('/api/leak')).text() })
  return `${String(form.formState.isDirty)}${query.data ?? ''}${useBad()}`
}
