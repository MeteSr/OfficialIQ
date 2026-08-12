.PHONY: dev start deploy deploy-staging deploy-ic frontend clean status cycles cycles-staging cycles-ic

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

cycles:
	bash scripts/check-cycles.sh local

cycles-staging:
	bash scripts/check-cycles.sh staging

cycles-ic:
	bash scripts/check-cycles.sh ic
