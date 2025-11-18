// scripts/init-mongo.js
// MongoDB initialization script
// This ensures the database and collections are set up properly

db = db.getSiblingDB('game-ops');

// Create collections with validation
db.createCollection('contributors', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['username'],
      properties: {
        username: {
          bsonType: 'string',
          description: 'GitHub username - required'
        }
      }
    }
  }
});

db.createCollection('challenges');
db.createCollection('users');
db.createCollection('prmetadatas');
db.createCollection('quartersettings');
db.createCollection('quarterlywinners');
db.createCollection('fetchdates');

// Create indexes
db.contributors.createIndex({ username: 1 }, { unique: true });
db.contributors.createIndex({ totalPoints: -1 });
db.contributors.createIndex({ currentStreak: -1 });
db.contributors.createIndex({ 'processedPRs.prNumber': 1 });
db.contributors.createIndex({ 'processedReviews.prNumber': 1 });
db.contributors.createIndex({ 
  'quarterlyStats.currentQuarter': 1, 
  'quarterlyStats.pointsThisQuarter': -1 
});

db.challenges.createIndex({ status: 1, endDate: 1 });
db.challenges.createIndex({ endDate: 1 });

db.users.createIndex({ githubId: 1 }, { unique: true });

db.prmetadatas.createIndex({ repoOwner: 1, repoName: 1 }, { unique: true });

db.quarterlywinners.createIndex({ quarter: 1 }, { unique: true });
db.quarterlywinners.createIndex({ year: -1, quarterNumber: -1 });

print('MongoDB initialization completed!');
print('Collections created: contributors, challenges, users, prmetadatas, quartersettings, quarterlywinners, fetchdates');
print('Indexes created successfully');
