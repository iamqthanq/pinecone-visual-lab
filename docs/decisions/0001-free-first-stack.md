# ADR 0001: a local, free-first seminar workbench

Status: accepted for D01 under Issue #1. Date: 2026-11-11.

The seminar needs inspectable processing, source provenance, and an offline fallback. It does not need accounts, billing, multi-tenant infrastructure, or paid model services.

Use React/TypeScript/Vite and Tailwind for a responsive browser lab, FastAPI for local Python services, npm with a committed root lockfile, and a Windows Python venv with fully pinned requirements. Bind dev services to loopback. System-specific instructions use PowerShell; the pre-push hook uses the shell supplied by Git for Windows. Fonts are bundled from Fontsource so UI rendering does not require a font CDN.

SQLite, local E5 embeddings, Pinecone live/local adapters, and optional Ollama are future phases. Default tests require no cloud key or downloaded AI weights. Dependency installation still requires registry access (or an existing package cache); 'offline CI' means no external AI/cloud service during tests, not air-gapped installation.

The frontend uses small Lucide interface glyphs, not imitation third-party brand logos. GSAP is deferred to the planned animation phases. D01 interactions use short CSS transitions with reduced-motion support.

The npm lockfile pins the complete tree. A minimatch 11.0.1 override addresses GHSA-g3hv-75wg-m249 in the ESLint/TypeScript lint dependency graph. The resolved tree contains no older minimatch users. Full lint/typecheck/test/build is rerun after the override. This is development tooling, not shipped application code. Future dependency changes must recheck override compatibility and the advisory state.

GitHub `main` was inspected as unprotected, with no rulesets returned. Local guards reduce mistakes; they cannot restrict an administrator who disables them. Server protection remains an owner decision, unchanged by D01.
