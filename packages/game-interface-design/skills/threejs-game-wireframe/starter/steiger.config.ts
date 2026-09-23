import fsd from '@feature-sliced/steiger-plugin'
import { defineConfig } from 'steiger'

export default defineConfig([...fsd.configs.recommended, { ignores: ['**/__test__/**', '**/__docs__/**'] }])
