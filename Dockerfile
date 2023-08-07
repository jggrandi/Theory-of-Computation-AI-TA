# Use an official Node.js runtime as the base image
FROM node:20

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install the app's dependencies inside the container
RUN npm install

# Copy the rest of the app's files to the container
COPY . .

# Build the Next.js app
RUN npm run build

# Expose port 3000 to the outside world once the container is running
EXPOSE 3000

# Command to run the app using npm
CMD ["npm", "start"]
