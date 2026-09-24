# @lodado/eslint-config

Composable ESLint 10 flat-config presets. Enable only the ones a package needs:

```js
import base from '@lodado/eslint-config'
import react from '@lodado/eslint-config/react'
import localRules from '@lodado/eslint-config/local-rules'

export default [...base, ...react, ...localRules]
```

Which preset fits which package, what each one reports and how to adopt a stricter one on an
existing repo: [eslint-setup skill](https://github.com/lodado/my-Vibe-Coding-Helper/blob/main/packages/vibe-coding-helper/skills/eslint-setup/SKILL.md).
The strict architecture profile: [STRICT.md](./STRICT.md). The SonarJS quality preset: [QUALITY.md](./QUALITY.md).
