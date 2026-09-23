import { createRoot } from 'react-dom/client'
import { QueryProvider } from './app/providers/QueryProvider'
import { CheckoutPanel } from './components/CheckoutPanel'

const root = document.querySelector('#root')
if (root) createRoot(root).render(<QueryProvider><CheckoutPanel /></QueryProvider>)
