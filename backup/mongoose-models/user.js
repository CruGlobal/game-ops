// models/user.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    githubId: { type: String, required: true, unique: true },
    username: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);
export default User;