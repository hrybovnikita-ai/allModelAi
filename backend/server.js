const app = require('./app');

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || '0.0.0.0';
const database = app.locals.db;

const server = app.listen(PORT, HOST, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Phones and tablets can use this same process over the public URL or LAN IP.`);
    console.log(`Database is connected at ${database.filePath}`);
});

const closeServer = () => {
    server.close(async () => {
        await app.locals.cache.close();
        database.close();
        process.exit(0);
    });
};

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
