import mongoose from 'mongoose';

async function listDatabases() {
    try {
        // Connect to MongoDB server
        await mongoose.connect('mongodb://localhost:27017');

        const admin = mongoose.connection.db.admin();
        const { databases } = await admin.listDatabases();

        console.log('📦 Available Databases:\n');
        for (const db of databases) {
            console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);

            // Connect to each database and list collections
            const dbConn = mongoose.connection.useDb(db.name);
            const collections = await dbConn.db.listCollections().toArray();

            if (collections.length > 0) {
                console.log(`    Collections:`);
                for (const coll of collections) {
                    const count = await dbConn.db.collection(coll.name).countDocuments();
                    console.log(`      - ${coll.name}: ${count} documents`);
                }
            }
            console.log('');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

listDatabases();
