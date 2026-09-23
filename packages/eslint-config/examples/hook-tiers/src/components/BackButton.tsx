import { useNavigate } from 'react-router'

export function BackButton(): React.ReactNode {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  )
}
