.PHONY: dev start deploy deploy-staging deploy-ic frontend clean status cycles cycles-staging cycles-ic top-up-staging top-up-ic smoke-staging smoke-ic stable-compat

dev: deploy frontend

start:
	dfx start --background

deploy:
	bash scripts/deploy.sh local

# Real-network deploys — see docs/DEPLOYMENT.md for one-time identity/wallet
# setup. Both require a funded cycles wallet; scripts/deploy.sh refuses to
# run without one rather than fail partway through.
deploy-staging:
	bash scripts/deploy.sh staging

deploy-ic:
	bash scripts/deploy.sh ic

frontend:
	cd frontend && npm install && npm run dev

clean:
	dfx stop; dfx start --background --clean

status:
	dfx canister status --all --network local 2>/dev/null || echo "No local replica running"

# Cycle balance + runway per canister; non-zero exit when any is close to
# freezing. See docs/DEPLOYMENT.md → "Cycles".
cycles:
	bash scripts/check-cycle-health.sh local

cycles-staging:
	bash scripts/check-cycle-health.sh staging

cycles-ic:
	bash scripts/check-cycle-health.sh ic

top-up-staging:
	bash scripts/top-up-canisters.sh staging

top-up-ic:
	bash scripts/top-up-canisters.sh ic

smoke-staging:
	bash scripts/smoke-deployed.sh staging

smoke-ic:
	bash scripts/smoke-deployed.sh ic

# Can every canister upgrade in place from main? (what stable-compat.yml runs)
stable-compat:
	bash scripts/ci/check-stable-compat.sh origin/main
