// models/fetchDate.js
import mongoose from 'mongoose';

const fetchDateSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
    },
});

const FetchDate = mongoose.model('FetchDate', fetchDateSchema);

export default FetchDate;