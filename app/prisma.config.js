// Prisma 7 moved the datasource URL out of schema.prisma. CLI commands
// (`prisma generate`, `prisma db push`) read it from here instead. The
// application itself does not use this file — it connects through the driver
// adapter in lib/prisma.js.
import 'dotenv/config';

export default {
    schema: 'prisma/schema.prisma',
    datasource: {
        url: process.env.DATABASE_URL,
    },
};
