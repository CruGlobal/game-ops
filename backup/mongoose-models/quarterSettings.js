import mongoose from 'mongoose';

const quarterSettingsSchema = new mongoose.Schema({
    _id: {
        type: String,
        default: 'quarter-config'  // Singleton pattern
    },
    systemType: {
        type: String,
        enum: ['calendar', 'fiscal-us', 'academic', 'custom'],
        default: 'calendar',
        required: true
    },
    q1StartMonth: {
        type: Number,
        min: 1,
        max: 12,
        default: 1,  // January for calendar quarters
        required: true
    },
    customQuarters: [{
        quarter: {
            type: String,
            enum: ['Q1', 'Q2', 'Q3', 'Q4']
        },
        startMonth: {
            type: Number,
            min: 1,
            max: 12
        },
        endMonth: {
            type: Number,
            min: 1,
            max: 12
        }
    }],
    lastModified: {
        type: Date,
        default: Date.now
    },
    modifiedBy: {
        type: String,
        default: 'system'
    }
}, {
    timestamps: true
});

// Helper method to get quarter start months
quarterSettingsSchema.methods.getQuarterMonths = function() {
    const systemMonths = {
        'calendar': 1,    // January
        'fiscal-us': 10,  // October
        'academic': 9,    // September
        'custom': this.q1StartMonth
    };

    return systemMonths[this.systemType] || this.q1StartMonth;
};

// Helper method to get all four quarter definitions
quarterSettingsSchema.methods.getAllQuarters = function() {
    const q1Start = this.getQuarterMonths();

    const quarters = [];
    for (let i = 0; i < 4; i++) {
        const startMonth = ((q1Start + i * 3 - 1) % 12) + 1;
        const endMonth = ((startMonth + 2 - 1) % 12) + 1;

        quarters.push({
            quarter: `Q${i + 1}`,
            startMonth: startMonth,
            endMonth: endMonth
        });
    }

    return quarters;
};

const QuarterSettings = mongoose.model('QuarterSettings', quarterSettingsSchema);

export default QuarterSettings;
