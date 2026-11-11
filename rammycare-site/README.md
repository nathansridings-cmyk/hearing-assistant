# Rammy marketing site

Static site for [rammycare.com](https://rammycare.com/). It is self-contained. When it moves to its own repository, the files in this folder belong at that repository root, not inside another `rammycare-site/` directory.

Do not copy `CNAME` to the root of `nathansridings-cmyk/hearing-assistant`. That repository already serves hearingassistant.app. A root `CNAME` there would replace that domain.

## Publish on GitHub Pages

The cloud agent token can only access `nathansridings-cmyk/hearing-assistant`, so it could not create `nathansridings-cmyk/rammycare`.

1. Create a public repository named `rammycare` under `nathansridings-cmyk`.
2. Put these files at the root of `main` (`index.html` and `CNAME` beside each other).
3. In the repository, open Settings → Pages. Deploy from the `main` branch, folder `/` (root).
4. The custom domain is already `rammycare.com` via `CNAME`.
5. After GitHub shows a certificate for that domain, turn on Enforce HTTPS.

Until the Porkbun records below replace the parking records, `https://rammycare.com` will not show this site. With `CNAME` committed, `https://nathansridings-cmyk.github.io/rammycare/` may redirect to the custom domain before DNS is ready. To preview on github.io first, enable Pages once before the custom domain is verified.

## Porkbun DNS

Checked October 14, 2026: the apex still has Porkbun parking addresses (`207.207.210.23`, `207.207.210.36`, `207.207.210.50`), and `www` is a CNAME to `uixie.porkbun.com`. Remove those. Extra A, AAAA, or CNAME records on these names can block the GitHub certificate.

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `nathansridings-cmyk.github.io` |

GitHub will redirect `www.rammycare.com` to `rammycare.com` once both names point at Pages. Leave Porkbun URL forwarding off.

## Waitlist

The contact form posts with FormSubmit, the same approach as the Hearing Assistant facility waitlist, to `nathanridings5@gmail.com`. The first delivery asks FormSubmit to confirm that address. There is also a `mailto:` link for the same address. The form does not run without JavaScript; the mailto link does.
