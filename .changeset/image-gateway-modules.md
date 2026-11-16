---
'@lodado/eslint-plugin-local-rules': patch
'@lodado/eslint-config': patch
---

Fix the image boundary rule for projects with more than one gateway. `no-image-bypass` now lets a gateway module render the `<img>` it wraps, matches a gateway by its whole path (`@/shared/ui/Mark` no longer exempts `ProductMark.tsx`), reports a dynamic `import('next/image')`, and stops reading a capitalised `<Img>` component as the raw element. The `images` preset checks stylesheets only with `css: true`: alongside `base`, whose JavaScript rules run on every linted file, a stylesheet crashed the whole lint run.
