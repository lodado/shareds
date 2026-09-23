import '../styles.css'

import { mountPlayPage } from '../../pages/play/index.ts'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('#app mount point is missing')

const dispose = mountPlayPage(root)
// Vite HMR re-runs this module; tear the old page down first so loops and listeners never double.
import.meta.hot?.dispose(dispose)
