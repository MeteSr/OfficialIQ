.PHONY: dev start deploy frontend clean status

dev: deploy frontend

start:
	dfx start --background

deploy:
	bash scripts/deploy.sh local

frontend:
	cd frontend && npm install && npm run dev

clean:
	dfx stop; dfx start --background --clean

status:
	dfx canister status --all --network local 2>/dev/null || echo "No local replica running"
