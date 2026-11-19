# The cyberspace protocol

How a website tells cyberspace-crawler what it is, so the explorer can show it as a place in Cyberspace instead of inferring one.

## The fixed address

```
https://<host>/.well-known/cyberspace.json
```

The crawler asks every website it visits for this file first, before it reads anything else on the site. The path follows RFC 8615 (well-known URIs). The crawler obeys the site's robots.txt for this path as for any other, so a site that disallows the crawler cannot publish one.

How often the file is fetched again is set by its own HTTP caching headers (`Cache-Control: max-age`, `Expires`, `ETag`, `Last-Modified`). The crawler sends conditional requests, so an unchanged file costs one `304 Not Modified`.

## The file

```json
{
  "cyberspace": 1,
  "name": "Festi hf.",
  "repository": "https://github.com/festi/website",
  "tree": {
    "base": "/cyberspace/",
    "files": ["component-diagram.json", "shop/use-case.json", "shop/vision.json"]
  },
  "related": [
    { "url": "https://n1.is", "relation": "subsidiary" },
    { "url": "https://kronan.is", "relation": "subsidiary" }
  ],
  "noAi": ["/minar-sidur", "/umsoknir"]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `cyberspace` | yes | The protocol version: `1`. |
| `name` | no | What to call the site in Cyberspace, at most 200 characters. |
| `repository` | one of the two | A repository on github.com or gitlab.com whose `.dev` folders (or `.cyberspace-explorer/` tree) describe the site. The crawler adds it to its list and reads it from its git history. |
| `tree` | one of the two | Views served by the site itself. `base` is a URL, absolute or relative to the site, and `files` lists paths under it, laid out like a repository's `.cyberspace-explorer/` folder: `x.json` describes the site as a whole and `shop/x.json` its `shop` part. At most 500 files. |
| `related` | no | Other addresses that belong together with this one, with how: `subsidiary`, `parent`, `sibling`, `partner`, `same-owner`, `service` or `other`. They are suggested to the explorer's admin, not crawled automatically. |
| `noAi` | no | Path prefixes whose pages the crawler's AI step must not read. The crawler still counts them, so their place in the city is known, but their text is never sent to a model. |

A site gives `repository`, `tree` or both. When both are given, the tree's views are shown and the repository is crawled as well.

## What a view file holds

Each file in `tree.files` is one view, in the JSON the explorer already reads from repositories: a component, class, state or deployment diagram, a use case, user journey, capability, feature or operation, or a knowledge file (vision, backlog, decisions and the rest). The skills in [Meta/Agents/Skills](../Meta/Agents/Skills/README.md) and the catalogue in [Meta/Agents/Knowledge](../Meta/Agents/Knowledge/README.md) define them.

A path a view cites as a `source` names a page of the site, such as `/frettir`, instead of a file in a repository.

## When a site publishes nothing

Most sites will not publish this file. For those, the crawler reads what the site makes public anyway: its robots.txt and sitemaps, its front page and a sample of pages in each section, its DNS records and its registration (RDAP). An AI step then infers the site's views from that, marked as inferred and with a confidence for each. A site that publishes the file is shown as it describes itself, and nothing about it is inferred.

## The crawler

- **User agent:** `cyberspace-crawler/1.0 (+https://cyberspace-explorer.com/crawler)`.
- **robots.txt:** obeyed for every request to the site, matched on the token `cyberspace-crawler`. To keep it out:

  ```
  User-agent: cyberspace-crawler
  Disallow: /
  ```

- **Pace:** one request at a time per site, with a pause between them, and at most a few dozen pages per run.
- **Caching:** the crawler keeps each response's validators and lifetime and revalidates instead of refetching.
- **What it does not do:** it doesn't log in, submit forms, run scripts or follow links outside the site. It doesn't try to get past a site that refuses it, such as one that answers 403.
