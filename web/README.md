# Doorlist web

The Angular front end. See the [root README](../README.md) for the whole project.

```sh
npm install
npm start          # http://localhost:4200, proxies /api to the API on :5080
npm test           # Vitest unit tests
npm run lint       # ESLint (angular-eslint)
npm run build      # production build to dist/web/browser
```

To run it against a local API: `docker compose up -d db migrate api` from the repo root, then `npm start`.
