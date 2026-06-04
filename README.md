# @textfilters/spam

Lightweight spam guard primitives for composable text moderation.

## Installation

Add the GitHub Packages registry for the `@textfilters` scope:

```ini
@textfilters:registry=https://npm.pkg.github.com
```

Install with GitHub npm authentication configured. GitHub Packages requires authentication for npm installs, including public packages.

```sh
npm install @textfilters/core @textfilters/spam
```

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

## Release

Releases are managed by release-please. When a release is created from `main`, the workflow runs `npm run check` and publishes the package to GitHub Packages.

The package is prepared for publication to GitHub Packages, not the public npm registry.

## License

MIT
