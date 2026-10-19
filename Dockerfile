# Single-container deploy: builds the client + server, serves everything from one Node process.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Absolute public URL for link-preview tags (optional): docker build --build-arg VITE_PUBLIC_URL=https://...
ARG VITE_PUBLIC_URL=
ENV VITE_PUBLIC_URL=$VITE_PUBLIC_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "dist/server/index.js"]
