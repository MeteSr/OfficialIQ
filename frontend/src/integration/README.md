# Canister integration tests

Real calls against the backend canisters on a local icp network, through the
IDL the app uses (`src/declarations`, generated from the canisters by
`scripts/generate-declarations.sh`). CI runs them on every PR
(`.github/workflows/ci.yml`, job "Canister integration tests").

Run them locally (from the repo root, in WSL's own filesystem):

```bash
icp network start -d
icp deploy user content question exam ranking challenge mentorship association report
cd frontend && npm run test:integration
```

`globalSetup.ts` looks up the canister IDs and makes a fixed test identity
the admin of question, user, exam and ranking (the first `setAdmin` must
come from a controller, which is your icp identity). Each test file seeds its
own question bank under a unique sport id and uses fresh identities, so
re-running against the same network is fine.
