# Deployment

## GitHub Pages (current)

Push to `main`. `.github/workflows/deploy.yml` builds `dist/`, runs
`verify.py`, and publishes. Nothing else to do.

The workflow installs nothing — the build is Python standard library only, so
there is no lockfile, no `node_modules`, and no supply chain.

One-time setup: **Settings → Pages → Source: GitHub Actions.** Not
"Deploy from a branch" — that mode can only serve `/` or `/docs`, never
`/dist`.

`dist/` is gitignored on purpose. CI builds it fresh; a committed build output
is a merge conflict waiting to happen.

## Any static host

```bash
make build     # produces dist/
```

Upload the **contents** of `dist/` to the web root. Not the folder — its
contents. `index.html` must land at the root, not at `/dist/index.html`.

## If this moves to Apache or cPanel shared hosting

Two things cost real time to learn, kept here so they don't have to be learnt
twice:

**Run AutoSSL before enabling any HTTPS redirect.** The other order means the
first visitor gets a full-page certificate warning.

**`Cache-Control: immutable` is only safe on a filename carrying a content
hash.** Applied to a plain `main.css` it pins returning visitors to a stale
build for a year, with no recovery short of a force-reload. This build does
not hash filenames, so `immutable` is wrong here.

Also: enable "show hidden files" in cPanel File Manager or `.htaccess` fails
to upload silently.

## Before calling it production-ready

The structure supports the site; these checks are separate work and are not
all done:

- [ ] Navigation and browser history across all four screens
- [ ] Keyboard traversal, and the skip link from a non-home screen
- [ ] A screen reader on real hardware — currently untested
- [ ] `prefers-reduced-motion` actually freezing the field
- [ ] Mobile layout at 390px and landscape at 375px tall
- [ ] `make verify` — every asset resolves, no dangling fragments
- [ ] The social card unfurling correctly on WhatsApp and LinkedIn
- [ ] Canonical, `og:url` and `sitemap.xml` all naming the real domain

`make verify` covers the automatable ones. The rest need a browser and a
person.
