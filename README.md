# @textfilters/spam

Lightweight TypeScript anti-spam guard primitives for content moderation, chat
moderation, UGC moderation, rate limiting, duplicate detection, burst detection,
and actor-based message checks.

Use `@textfilters/spam` to add stateful spam checks beside censoring and
redaction filters in a composable TypeScript text filtering library.

## Installation

Add the GitHub Packages registry for the `@textfilters` scope:

```ini
@textfilters:registry=https://npm.pkg.github.com
```

Install with GitHub npm authentication configured. GitHub Packages requires authentication for npm installs, including public packages.

```sh
npm install @textfilters/core @textfilters/spam
```

## Use Cases

- Block repeated, too-fast, or bursty messages in chat moderation workflows.
- Add actor-based anti-spam checks before running heavier content moderation.
- Return stable spam decision reasons for application-specific moderation
  policy.
- Keep rate limiting and duplicate detection separate from text censoring
  filters.

## Usage

```ts
import { createSpamFilter } from "@textfilters/spam";

const spam = createSpamFilter({
  minIntervalMs: 700,
  duplicateWindowMs: 12_000,
  burstWindowMs: 10_000,
  burstMaxMessages: 6,
});

const decision = spam.check({
  actorKey: "user:123",
  text: "hello",
});
```

`createSpamFilter(config?)` returns a stateful guard with stable `name: "spam"` and a `reset()` method. The `spamFilter(config?)` export is a backwards-compatible alias for `createSpamFilter(config?)`.

## Behavior

The package provides an in-memory, actor-based spam guard for interval, duplicate, and burst checks. Each blocked decision returns a stable reason so callers can apply their own moderation policy.

Actor state is bounded by pruning stale entries as messages are checked. Use one guard instance for a shared moderation scope, or create isolated instances for separate tenants or test cases.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the decision flow, module map, and change guide.

## Related Textfilters Packages

- `@textfilters/core` for shared pipeline, normalization, and range masking
  primitives.
- `@textfilters/url` for URL detection, obfuscated links, and safe link
  censoring.
- `@textfilters/email` for email detection and contact redaction.
- `@textfilters/phone` for phone number detection and contact redaction.
- `@textfilters/profanity` for Russian profanity filtering and taxonomy-backed
  moderation.

## Release

Releases are managed by Release Please from Conventional Commit history on `main`. When a Release Please release is created, the workflow runs `npm run check` and publishes the package to GitHub Packages. Release tags keep the `v*` pattern.

The package is prepared for publication to GitHub Packages, not the public npm registry.

## License

MIT
