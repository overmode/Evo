FROM node:22-slim

# node-llama-cpp needs build tools for native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY templates ./templates
COPY extensions ./extensions
COPY entrypoint.sh ./

# Non-root user for the agent
RUN groupadd -r evo && useradd -r -g evo -m evo

# Workspace and model cache are mounted as volumes at runtime
RUN mkdir -p /workspace && chown evo:evo /workspace

ENV EVO_WORKSPACE=/workspace
ENV NODE_ENV=production

USER evo

ENTRYPOINT ["./entrypoint.sh"]
