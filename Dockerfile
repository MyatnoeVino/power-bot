FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Очистка кэша перед сборкой
RUN rm -rf /app/node_modules/.cache

EXPOSE 3000

CMD ["npm", "start"]
