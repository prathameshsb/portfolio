# Portfolio

Next.js and TypeScript portfolio with reusable case-study sections and locally bundled media.

```sh
npm ci
npm run dev
```

Use Node.js 24. Validate changes with `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

Project content lives in `data/projects`; `components/case-study` renders the checked section variants. The development-only fixture demonstrates the same renderer without another page layout.

Server features require environment-specific configuration. Credentials and operational data belong outside this repository. New deployments keep collection disabled until persistence is configured.
