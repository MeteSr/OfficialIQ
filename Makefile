.PHONY: dev start deploy deploy-staging deploy-ic frontend clean status cycles cycles-staging cycles-ic

dev: deploy frontend

start:
	icp network start -d

deploy:
	bash scripts/deploy.sh local

# Mainnet deploys — see docs/DEPLOYMENT.md for one-time identity setup.
# Both spend the deploying identity's cycles balance; scripts/deploy.sh
# refuses to start when it's nearly empty rather than fail partway through.
deploy-staging:
	bash scripts/deploy.sh staging

deploy-ic:
	bash scripts/deploy.sh ic

frontend:
	cd frontend && npm install && npm run dev

# Wipes the project-local network's state (canisters and data).
clean:
	icp network stop; rm -rf .icp/cache; icp network start -d

status:
	icp canister status -e local 2>/dev/null || echo "No local network running (make start)"

cycles:
	bash scripts/check-cycles.sh local

cycles-staging:
	bash scripts/check-cycles.sh staging

cycles-ic:
	bash scripts/check-cycles.sh ic
