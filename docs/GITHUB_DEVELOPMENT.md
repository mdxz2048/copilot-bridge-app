# GitHub development workflow

The repository is self-contained. A fresh clone does not require the former
sibling `upstream-copilot-sdk-proxy` or the parent `docs` directory.

## Windows setup

Prerequisites:

- Git
- Node.js from `.node-version`
- npm

```powershell
git clone git@github.com:mdxz2048/copilot-bridge-app.git
Set-Location copilot-bridge-app
npm ci
npm test
npm run package:installer
```

`npm ci` builds the pinned, MIT-licensed Proxy source in
`vendor/copilot-sdk-proxy`. The application then uses the package through the
repository-local `file:vendor/copilot-sdk-proxy` dependency.

Generated files remain local:

- `node_modules/`
- `vendor/copilot-sdk-proxy/dist/`
- `dist-electron/`
- `dist-renderer/`
- `resources/node-runtime/`
- `release/`

## GitHub Actions

`.github/workflows/windows.yml` validates every pull request and push to
`main` on a GitHub-hosted Windows runner. It performs:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run test:proxy`
5. `npm run package:installer`
6. Upload of the NSIS installer as a workflow artifact

Production credentials and integration-account passwords are not GitHub
secrets for this workflow. Production HTTPS E2E remains an explicit release
gate run from a trusted Windows environment.

## Updating the vendored Proxy

The upstream repository and pinned commit are recorded in
`docs/third-party/UPSTREAM.md`. Preserve `vendor/copilot-sdk-proxy/LICENSE`
and update `docs/third-party/PATCHES.md` whenever the snapshot changes.

Do not reintroduce an absolute path or a `file:../...` dependency.
