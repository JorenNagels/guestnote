# ADR 0006 — IAM cannot read GitHub's custom OIDC claims, so `sub` is the whole boundary

**Date:** 2026-08-30 · **Status:** Settled, measured against a green CI deploy.

The first CI deploy this repo ever attempted was refused seven times over roughly two hours with
`Not authorized to perform sts:AssumeRoleWithWebIdentity`, while every claim the trust policy
pinned matched the real token **byte for byte**. This records why, because the failure gives no
signal that points at the cause and the obvious instinct — pin more claims — is what causes it.

Repairs `infra/github-oidc.yaml`'s belt-and-braces comment, which asserted a protection that had
never once been evaluated, and one wrong hypothesis committed in `e41f7c8` along the way.

## The question

`GuestnoteDeployRole` carries `AdministratorAccess` (SST's recommendation for a self-hosted CI
role). What actually stops anyone but this repo's deploys from assuming it?

The answer written into the template was *four* conditions — `aud`, `sub`, `repository`,
`repository_owner` — with the last two described as:

> *"belt-and-braces that does NOT depend on `sub` being edited correctly: even a botched `sub`
> cannot let this role be assumed from outside this one repo, which matters because
> AdministratorAccess is behind it."*

## What was measured

CloudTrail showed the presented subject on every refused attempt:

```
repo:JorenNagels@37642555/guestnote@1336925415:environment:staging
```

A `workflow_dispatch` job (`oidc-debug.yml`, deleted with this change) decoded the token GitHub
actually issues — claims only, never the raw JWT — and a script compared all four pinned values
against the live trust policy:

```
MATCH  token.actions.githubusercontent.com:sub
MATCH  token.actions.githubusercontent.com:aud
MATCH  token.actions.githubusercontent.com:repository          # "JorenNagels/guestnote"
MATCH  token.actions.githubusercontent.com:repository_owner    # "JorenNagels"
```

One statement, correct `Principal.Federated`, no other condition operators, no permissions
boundary on the role, and no restrictive SCP in the org (`o-4uh054vlps` has only
`FullAWSAccess`). Failures continued nine minutes after the policy update, so it was not IAM
propagation — that was tested explicitly, twice.

**The bisect settled it.** Dropping `repository` and `repository_owner` and changing nothing else
turned the same subject into `SUCCESS` at `2026-08-30T10:41:05Z`, and the deploy ran end to end.

## The decision

**Pin `aud` and `sub`. Nothing else, ever.**

IAM populates only a small set of OIDC claims as condition keys — `aud`, `sub`, and for this
provider `job_workflow_ref`. GitHub's `repository`, `repository_owner`, `actor`, `ref` and the
rest are in the JWT but are **not** condition keys. A `StringEquals` against a key IAM never
populates evaluates to false, and false in a trust policy is a denial. So the two conditions
added for safety were not weak protection — they were an unconditional `Deny` wearing the
costume of defence in depth.

IAM names the usable pair itself, in the guardrail that refuses to *write* a policy scoped to
neither:

> `Trust policy with trusted principal arn:aws:iam::929219061071:oidc-provider/token.actions.githubusercontent.com must evaluate, using StringEquals, StringLike or StringEqualsIgnoreCase, token.actions.githubusercontent.com:sub or token.actions.githubusercontent.com:job_workflow_ref which is not scoped to all.`

That error is what identified the pair, and it is also why the bisect had to run in the direction
it did: the first attempt — keep `repository`, drop `sub` — was rejected at write time.

**Nothing is given up.** GitHub issues this repo an *immutable* subject, so the org id and repo id
are inside `sub` itself:
`repo:JorenNagels@37642555/guestnote@1336925415:environment:staging`. A matching `sub` already
proves which repository asked, at ids a rename cannot change. The dropped conditions were
restating what `sub` says — and could not be evaluated to say it.

The `GitHubOrg`, `GitHubRepo`, `GitHubOrgId` and `GitHubRepoId` parameters went with them. They
existed only to build the two dead conditions, and a parameter that looks like it re-scopes an
`AdministratorAccess` role while doing nothing is worse than no parameter.

## The cost accepted

A botched `GitHubSub` edit is now the only thing between this role and a wider trust. That risk is
real but small and bounded: the values are literal (`StringEquals`, never `StringLike`, so a
hand-appended `*` is inert), IAM refuses outright to store a policy that scopes `sub` to
everything, and `infra/README.md` step 4 requires reading the resulting policy back rather than
trusting the exit code.

## Two traps found on the way, both silent

1. **`aws cloudformation deploy` ignores a changed template `Default:`.** It sends
   `UsePreviousValue=true` for every parameter absent from `--parameter-overrides`, so the stored
   value wins; if nothing else changed a resource, it prints *"No changes to deploy"* and exits
   **0**. A re-apply that looked successful changed nothing. Always pass `GitHubSub` explicitly.
2. **Pass it as JSON, not shorthand.** The value is itself comma-separated
   (`CommaDelimitedList`) and the shorthand parser splits on those commas — which is how three of
   the four originally deployed entries acquired a trailing `\`. `infra/README.md` carries the
   `file://` form and the read-back check.

Both share the shape of CLAUDE.md invariants 10 and 12: an infrastructure write that reports
success and does not do what it says. Read the result back; never trust the exit code.

## What this leaves true

- `.github/workflows/deploy.yml` runs every deploy against a GitHub Environment, so the claim is
  `repo:<org>/<repo>:environment:<stage>` — a `main` push deploys `staging`, a `v*` tag deploys
  `production`. Both subject forms stay in `GitHubSub`; appending, never replacing, is still the
  rule if the ids ever change.
- `infra/github-oidc.yaml`'s comment about the `repository` pair is rewritten rather than deleted,
  so the next person to reach for it finds out why it does not work before adding it back.
- The least-privilege scoping of `AdministratorAccess` remains
  [deferred](../../infra/README.md#deferred), and is now the *only* remaining containment work on
  this role.
