# Throttle Tribe static site

Plain HTML, no build step. Pages: `index.html`, `j/index.html` (invite), `privacy/index.html`, `delete/index.html`.

## Publish with GitHub Pages

1. On GitHub, create a **public** repo named `throttletribe`.
2. Upload the **contents** of this `web/` folder to the repo root (so `index.html`, `j/`, `privacy/`, `delete/` and `.nojekyll` sit at the top level). Alternative: put them in `/docs` on `main` and pick `/docs` in step 3.
3. Repo **Settings -> Pages -> Build and deployment -> Deploy from a branch -> Branch: `main`, folder `/(root)`** -> Save.
4. Wait a minute or two. URLs (replace `<username>`):
   - Home: `https://<username>.github.io/throttletribe/`
   - Invite: `https://<username>.github.io/throttletribe/j/?c=123456`
   - Privacy: `https://<username>.github.io/throttletribe/privacy/`
   - Delete account: `https://<username>.github.io/throttletribe/delete/`
5. Use the privacy and delete URLs in the Play Console (Data safety / account deletion).

## Point the app at it

In the app's `.env`:

```
EXPO_PUBLIC_INVITE_BASE_URL=https://<username>.github.io/throttletribe/j/
```

`EXPO_PUBLIC_*` values are baked in at build time, so **rebuild** the app after changing it.

## Before going live

- Privacy and delete pages are DRAFTS with `[BRACKETED]` placeholders (entity, address, email, dates). Resolve them and remove the draft banners.
- Replace nothing in `j/index.html` except if the Android package changes (`com.throttletribe.app`).
- The invite page only shows the 6-digit code, never a ride name or riders.

## Custom domain later

1. Buy a domain, add a `CNAME` file in the repo root containing the domain (e.g. `rides.example.com`), and set the same in Settings -> Pages -> Custom domain. Create a DNS `CNAME` record pointing to `<username>.github.io`. Enable "Enforce HTTPS".
2. Update `EXPO_PUBLIC_INVITE_BASE_URL` and rebuild.
3. With your own domain you can host `/.well-known/assetlinks.json` (and add an `intent filter` with `autoVerify` for that host in `app.json`). Verified **Android App Links** then open the app directly from the https link, with no browser bridge page. (A `github.io/throttletribe/` project path cannot serve this file at the host root, which is why a custom domain is needed.)
