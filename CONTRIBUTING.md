# Contributing to EasySchematic

Thanks for your interest in contributing! EasySchematic is an open-source AV signal flow diagram tool, and contributions of all kinds are welcome.

## Getting Started

### Prerequisites
- Node.js 20+ recommended
- npm 10+

> Note (macOS): the backend tooling (`wrangler` / `miniflare`) can pull in native `sharp`. If you see `sharp` build errors, use Node.js 20+ (recommended) or set `SHARP_IGNORE_GLOBAL_LIBVIPS=1`.

### Local Development

```bash
# Clone the repo
git clone https://github.com/duremovich/EasySchematic.git
cd EasySchematic

# Install dependencies
npm install

# Start the dev server (main app on localhost:5173)
npm run dev
```

The project is a monorepo with four packages:

| Package | Description | Dev Port |
|---------|-------------|----------|
| `/` (root) | Main schematic editor | 5173 |
| `/api` | Cloudflare Worker API (D1 database) | 8787 |
| `/docs` | Documentation site | 5174 |
| `/devices` | Community device database UI | 5175 |

To run the repo locally, start the parts you need (each is its own package):

```bash
# Main app
cd /path/to/EasySchematic
npm ci
npm run dev

# API (Cloudflare Worker)
cd api
npm ci
npm run dev

# Devices UI
cd ../devices
npm ci
npm run dev

# Docs site
cd ../docs
npm ci
npm run dev
```

### Build & Lint

```bash
npm run build    # Generate fallback data + TypeScript check (tsc -b) + Vite build
npm run lint     # ESLint
```

Both must pass before merging.

## Ways to Contribute

### Submit Device Templates

The easiest way to contribute — add devices to the community database:

1. Go to [devices.easyschematic.live](https://devices.easyschematic.live)
2. Click "Submit a Device"
3. Fill in the manufacturer, model, category, and port configuration
4. Submit for moderation

No code required. Templates are reviewed and merged into the shared library.

### Bug Reports

[Open an issue](https://github.com/duremovich/EasySchematic/issues) with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Browser and OS

If possible, export your schematic (File > Save as JSON) and attach it — this makes reproducing layout/routing bugs much easier.

### Code Contributions

1. Fork the repo and create a branch from `master`
2. Make your changes
3. Ensure `npm run build` and `npm run lint` pass
4. Open a pull request against `master`

#### Architecture Notes

- **State management**: Zustand store in `src/store.ts`
- **Canvas**: Built on [@xyflow/react](https://reactflow.dev/) v12
- **Edge routing**: Custom A\* pathfinder in `src/edgeRouter.ts` — see `ROUTING_RULES.md` for the algorithm's aesthetic rules and penalty system
- **Schema**: JSON files use versioned schemas with forward migrations in `src/migrations.ts`. Bumping the schema version requires a migration.
- **Styling**: Tailwind CSS v4

#### Terminology

In code you'll see React Flow terms (`node`, `edge`, `handle`), but user-facing text and documentation should always use AV terminology:

| Code Term | User-Facing Term |
|-----------|-----------------|
| Node | Device |
| Edge | Connection |
| Handle | Port |

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](LICENSE) license.
