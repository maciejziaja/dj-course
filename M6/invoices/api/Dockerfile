FROM node:24-alpine

WORKDIR /usr/src/app

# Kopiowanie plików zależności
COPY package*.json ./
COPY tsconfig.json ./

# Instalacja zależności
RUN npm install

# Kopiowanie kodu źródłowego
COPY . .

# Kompilacja TypeScript do JavaScript
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]