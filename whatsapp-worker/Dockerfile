FROM node:20-slim

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

VOLUME ["/app/sessions"]
EXPOSE 3300

CMD ["node", "server.js"]
