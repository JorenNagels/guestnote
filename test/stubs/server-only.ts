/**
 * Stands in for the `server-only` marker package under Vitest.
 *
 * The real package is a tripwire, not a module: its `exports` map serves an empty file
 * under the `react-server` condition and a file that does nothing but `throw` under every
 * other one. That is exactly the point in the app -- importing `src/env.ts` from a Client
 * Component becomes a build error rather than a leaked secret -- but a test runner
 * resolves as plain Node, takes the throwing branch, and cannot import `proxy.ts` at all.
 *
 * The alternative was `resolve.conditions: ['react-server']`, which is rejected because
 * the condition is not scoped to one package: React's own `exports` map answers it with
 * `react.react-server.js`, a build with no hooks. That would quietly break every
 * component test to fix one import here.
 *
 * The guard this removes is a *build-time* one, enforced by Next against real Client
 * Components. Nothing about a Vitest run was ever going to enforce it, so nothing is lost.
 */
export {}
