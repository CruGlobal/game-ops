FROM node:23-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY app/package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY app ./

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 3000

# Run the web service on container startup
CMD ["npm", "start"]
