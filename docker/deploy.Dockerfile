# Portable deploy environment — installs icp-cli, mops + Node so any Docker-capable
# host (GitLab CI, a self-hosted runner, a bare VPS, a developer's own
# machine) can build and deploy OfficialIQ identically, without depending
# on GitHub Actions. See docs/DEPLOYMENT.md's "Deploying without GitHub"
# section for the full walkthrough.
#
# Usage:
#   docker build -f docker/deploy.Dockerfile -t officialiq-deploy .
#   docker run --rm \
#     -e ICP_IDENTITY_PEM="$(cat my-key.pem)" \
#     officialiq-deploy staging
#
# The image bakes in whatever source was present at `docker build` time —
# rebuild it (or bind-mount a fresh checkout over /app) to deploy newer code.

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git bash libdbus-1-3 libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN bash scripts/install-icp.sh
ENV PATH="/app/tools/node_modules/.bin:${PATH}"

ENTRYPOINT ["bash", "scripts/docker-deploy-entrypoint.sh"]
CMD ["local"]
