import AWS from 'aws-sdk';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables from a .env file into process.env
dotenv.config();

// Check if the environment is production
const isProduction = process.env.NODE_ENV === 'production';

let dbClient;

if (isProduction) {
    // Configure AWS SDK with region and credentials for DynamoDB
    AWS.config.update({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
    // Initialize DynamoDB DocumentClient for production
    dbClient = new AWS.DynamoDB.DocumentClient();
} else {
    // Connect to MongoDB using Mongoose for development
    mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    }).catch(err => {
        // Log any connection errors and exit the process
        console.error('Error connecting to MongoDB', err);
        process.exit(1);
    });
    // Use Mongoose as the database client for development
    dbClient = mongoose;
}

// Export the database client (DynamoDB DocumentClient or Mongoose)
export default dbClient;