FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY contracts/ ./contracts/

ENV PORT=4024
EXPOSE 4024

CMD ["node", "backend/src/server.js"]
