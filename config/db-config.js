import AWS from 'aws-sdk';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

let dbClient;

if (isProduction) {
    AWS.config.update({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
    dbClient = new AWS.DynamoDB.DocumentClient();
} else {
    mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    }).catch(err => {
        console.error('Error connecting to MongoDB', err);
        process.exit(1);
    });
    dbClient = mongoose;
}

export default dbClient;