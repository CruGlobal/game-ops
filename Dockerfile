FROM node:18
WORKDIR /app
COPY package*.json ./
# install node modules
RUN npm install
COPY . .
EXPOSE 3000

# Run the web service on container startup
CMD ["npm", "start"]
#CMD [ "node", "github-pr-scoreboard.js" ]
