const app = require('./app');

const PORT = process.env.PORT || 5050;
const database = app.locals.db;

const server = app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Database is connected at ${database.filePath}`);
});

const closeServer = () => {
    server.close(() => {
        database.close();
        process.exit(0);
    });
};

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
