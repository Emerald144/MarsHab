# MarsHab

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://frame-forger-plus.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2e8d7083-3222-4107-875a-2e0a0976e999).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Repository layout

- Frontend (TanStack Start): `src/`, `public/`, `package.json` (repository root, required by Lovable)
- Backend (FastAPI): `backend/` - see `backend/README.md`
- Data: `data/raw`, `data/processed`, `data/web`, `data/metadata`
- GIS scripts: `scripts/gis/`
- Team docs: `docs/team/` (start with `PROJECT_STATUS.md`)
