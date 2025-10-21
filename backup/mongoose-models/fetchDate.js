import mongoose from 'mongoose';

// Define the schema for storing fetch dates
const fetchDateSchema = new mongoose.Schema({
    // The date when the data was fetched
    date: {
        type: Date,
        required: true, // This field is required
    },
});

// Create a model for the fetch date schema
const FetchDate = mongoose.model('FetchDate', fetchDateSchema);

export default FetchDate;