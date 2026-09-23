# `@guestnote/storage`

Presigned upload and download for the private files bucket: the Files screen and the moodboard
(`docs/specs/0003-planner-app-screens.md`, slice F4). The browser PUTs straight to S3 with a URL
this package signs; no file passes through a Lambda.

Built on the shape of `packages/email`: one file touches the provider, config arrives as
arguments, and everything returned is plain data.

## The seam

`createStorage({ transport, maxBytes? })`. Nothing it returns names an AWS type.
`apps/web/src/lib/storage.ts` is the only composition point and the only place that knows a bucket
name or a region. It builds a real S3 transport when `GUESTNOTE_FILES_BUCKET` is set, and in
development only, when it is not, a local-directory transport (`lib/dev-files.ts`, files under
`apps/web/.files/`, served by `app/api/dev-files`). Outside development an unset bucket throws.

```
Server Function (checks membership itself)
  -> createStorage().presignUpload / presignDownload   validates, builds the key, sets expiry
    -> StorageTransport.presignPut / presignGet          the port
      -> src/s3.ts                                       the only AWS SDK contact
```

| File | Role |
|---|---|
| `src/index.ts` | `createStorage`; everything that is not the provider's business |
| `src/types.ts` | `UploadRequest`, `UploadResult`, `StorageTransport` and friends |
| `src/keys.ts` | `buildObjectKey`, `assertKeyInScope`, `contentDisposition`. Pure, no SDK |
| `src/limits.ts` | the size default, the expiry, the content-type allow-list |
| `src/s3.ts` | **the only file allowed to import `@aws-sdk/client-s3` or `@aws-sdk/s3-request-presigner`** |

## Rules worth knowing before editing

**1. The SDK is contained, and two things hold it.** `biome.json` restricts both packages to
`src/s3.ts`; `packages/db/src/no-unsafe-imports.test.ts` greps for them independently, because a
lint rule can be silenced and a test cannot. Invariant 5.

**2. Config is arguments.** Invariant 6. `createS3Transport({ region, bucket })` reads no
environment. `credentials` exists for tests and a laptop; deployed, leave it unset and the SDK
resolves the Lambda role.

**3. No part of a key is user-controlled.** A key is `<orgId>/<weddingId>/<fileId>`, all UUIDs,
validated before use. The filename lives in `files.name` and reaches a browser only through
`Content-Disposition`. `presignDownload` refuses (throws) a key outside the caller's scope.
The prefix is for operators and for that check; **it is not access control** -- the presigned URL
is, and whether to mint one is the calling Server Function's decision.

**4. Two SDK defaults are wrong for a presigned PUT, and both are overridden.** Measured against
`@aws-sdk/client-s3@3.1113.0`, 2026-09-21, by signing a URL offline and reading it back
(`src/s3.test.ts` asserts both, and was mutation-checked):

| Default | What it does | Override |
|---|---|---|
| `content-type` is not a signed header (`SignedHeaders=content-length;host`) | a URL minted for `image/png` stores whatever is sent | `signableHeaders: new Set(['content-type'])` |
| `requestChecksumCalculation: 'WHEN_SUPPORTED'` puts `x-amz-checksum-crc32=AAAAAA==` in the query | the CRC32 of an *empty* body, so every real upload fails `BadDigest` | `'WHEN_REQUIRED'` (and the response twin, for the GET) |

The second is a widely reported trap since the SDK made checksums default-on in early 2025 (from memory, not checked against the changelog); it is spelled out here because the URL still looks valid.

**5. The size limit is an exact length, not a ceiling.** A presigned PUT cannot say "at most
N" -- only a presigned POST policy can. So the caller declares `File.size`, the package refuses
a declaration over the limit, and the exact `Content-Length` is signed, so S3 refuses a body of
any other size. Rejected: switching to `@aws-sdk/s3-presigned-post` for `content-length-range`,
which is the more natural fit and a third SDK package to contain; the cost of PUT is that the
client must send the size it declared, which `File.size` always gives it.

## Limits

| | Value | Why |
|---|---|---|
| Size | 25 MiB, `maxBytes` overrides | Documents and phone photos. A guess, not a measurement |
| URL life | 5 minutes, both directions | It is a bearer credential and cannot be revoked; a download link is minted per click |
| Types | per `kind`, in `limits.ts` | No `image/svg+xml` and no `text/html`: both can carry script |

Nothing scans content. `File.type` is the browser's guess from an extension, so the allow-list
stops accidents and the cheap attack, not a determined one. Downloads default to
`Content-Disposition: attachment` so a browser saves an uploaded file rather than running it.

## Bundle size

Measured 2026-09-21, the method `packages/email/README.md` and ADR 0004 use, with one deviation.
The deviation: **no `next build` was run**, because nothing in `apps/web` imports this package
yet, so a standalone build would trace none of it. Instead `@vercel/nft` -- the tracer Next
vendors, and what `output: 'standalone'` uses -- was pointed at a `require` of each SDK entry,
which is the same file set a build would ship once something imports it.

| | Files traced | Size |
|---|---|---|
| `@aws-sdk/client-sesv2` (already shipped) | 77 | 1.09 MB |
| `@aws-sdk/client-s3` + `s3-request-presigner` | 91 | 1.25 MB |
| Union of the two | 93 | 1.44 MB |
| **Added on top of SES** | **16** | **0.35 MB** |

The two SDKs share `@aws-sdk/core`, `@smithy/*` and the credential providers, so S3 costs 0.35 MB
once SES is already there, of which `client-s3` is 0.26. Unpacked on disk (`.d.ts` included, and
so not what ships) `client-s3` is 3.3 MB against `client-sesv2`'s 1.94 MB. `npm install` added five
packages to the lockfile: `client-s3`, `s3-request-presigner`, `checksums`, `middleware-sdk-s3`
and `signature-v4-multi-region`.

Both SDK packages are pinned to exactly `3.1113.0`, the version `client-sesv2` resolves to, so npm
deduplicates the shared packages. A caret let it resolve `client-s3` to 3.1136 and bump shared
packages in the lockfile with it (measured: a 124-line lockfile deletion), which would have been a change to the *mail* path made by
an unrelated feature. Move all three together.

**The real check, 2026-09-21** (Files slice, S5), now that `apps/web` imports the package: `npm run
build -w @guestnote/web`, then `du -sk apps/web/.next/standalone`, once as shipped and once with
`src/s3.ts` temporarily replaced by a stub that imports no SDK (restored afterwards; the second
build is the "before"):

| | `.next/standalone` |
|---|---|
| Without the S3 SDK | 56,464 KB |
| As shipped | 58,152 KB |
| **Added** | **+1,688 KB (+3.0%)** |

That is above the 0.35 MB estimate, and the reason is worth knowing: without S3 there is **no**
`node_modules/@aws-sdk` in the standalone output at all (SES is bundled into the server chunks),
and with it Next externalises the whole `@aws-sdk` family into `node_modules` -- 804 KB of
`@aws-sdk/*` and 616 KB of `@smithy/*`, 16 and 5 packages. So the delta is not "S3 on top of SES
sharing everything"; it is the SDK moving from chunks to traced files, and the estimate above
measured the wrong thing. It is still small against 58 MB and against the ~80 MB `react-email`
mistake in CLAUDE.md invariant 11, so nothing changes; the number is here so a later jump is
noticed. `next build` succeeds with `GUESTNOTE_FILES_BUCKET` unset, because `lib/storage.ts`
builds lazily.

## Tests

`npm test` covers all of it; nothing here needs credentials or a network.

| File | What it holds |
|---|---|
| `keys.test.ts` | the key shape, traversal and cross-tenant refusals, the `Content-Disposition` header |
| `index.test.ts` | size limit at the boundary, the allow-list per kind, expiry, and that nothing is signed after a refusal -- against a recording transport, no SDK |
| `s3.test.ts` | the real presigner with a fake key: bucket, region, signed headers, no checksum parameters |

`s3.test.ts` does not mock the SDK. Signing is local, so the real presigner runs, and that is what
made the two defaults above visible; a mock would have accepted either.

## What is deliberately not here

- **Deletion and listing.** Neither `s3:DeleteObject` nor `s3:ListBucket` is granted to the app
  (`sst.config.ts`). Deleting a file removes its `files` row; the object stays until a lifecycle
  rule or a job removes it, and that is the Files slice's decision.
- **Multipart upload.** 25 MiB fits a single PUT. `etag` is already exposed in the bucket's CORS
  rule for the day it does not.
- **Virus scanning, image resizing, thumbnails.** None planned.
- **A deployed bucket.** `sst.config.ts` defines it; nothing has run `sst deploy` for it.
