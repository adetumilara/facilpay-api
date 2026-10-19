FROM node:20-alpine AS base

WORKDIR /app

FROM base AS dependencies

COPY package*.json ./

RUN npm ci

FROM dependencies AS development

ENV NODE_ENV=development

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]

FROM dependencies AS build

COPY . .

RUN npm run build

FROM base AS production

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Create non-root node user and set ownership of app directory
RUN chown -R node:node /app

# Switch to node user for running the application
USER node

EXPOSE 3000

CMD ["node", "dist/main"]
