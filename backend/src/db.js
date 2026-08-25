const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const defaultDatabase = { users: [], purchases: [], subscriptions: {}, usage: {}, conversations: [] };
let connection;

const readLegacyData = (filePath) => {
	if (!fs.existsSync(filePath)) return defaultDatabase;
	try { return { ...defaultDatabase, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) }; } catch { return defaultDatabase; }
};

const connectDatabase = () => {
	if (connection) return connection;
	const configuredPath = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(__dirname, '..', 'storage', 'database.sqlite');
	const isLegacyJson = path.extname(configuredPath).toLowerCase() === '.json';
	const filePath = isLegacyJson ? `${configuredPath}.sqlite` : configuredPath;
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const legacyData = isLegacyJson ? readLegacyData(configuredPath) : defaultDatabase;
	const database = new Database(filePath);
	database.exec(`
		CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT);
		CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY, name TEXT, email TEXT NOT NULL, city TEXT, date_of_birth TEXT, plan TEXT, created_at TEXT);
		CREATE TABLE IF NOT EXISTS subscriptions (email TEXT PRIMARY KEY, plan TEXT NOT NULL);
		CREATE TABLE IF NOT EXISTS usage (email TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, email TEXT NOT NULL, model TEXT, title TEXT, messages TEXT NOT NULL, created_at TEXT, updated_at TEXT);
		CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
		CREATE TABLE IF NOT EXISTS workspace_items (id TEXT PRIMARY KEY, email TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
		CREATE INDEX IF NOT EXISTS workspace_items_owner_type ON workspace_items(email, type, updated_at DESC);
	`);
	const userColumns = database.prepare('PRAGMA table_info(users)').all();
	if (!userColumns.some((column) => column.name === 'password_hash')) {
		database.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
	}
	database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email); PRAGMA optimize;');
	if (database.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0 && legacyData.users.length) {
		const insertUser = database.prepare('INSERT OR IGNORE INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)');
		const insertPurchase = database.prepare('INSERT OR IGNORE INTO purchases (id, name, email, city, date_of_birth, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
		const insertSubscription = database.prepare('INSERT OR REPLACE INTO subscriptions (email, plan) VALUES (?, ?)');
		const insertUsage = database.prepare('INSERT OR REPLACE INTO usage (email, used) VALUES (?, ?)');
		const insertConversation = database.prepare('INSERT OR REPLACE INTO conversations (id, email, model, title, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
		database.transaction(() => {
			legacyData.users.forEach((user) => insertUser.run(user.id, user.name, user.email, user.passwordHash || null));
			legacyData.purchases.forEach((purchase) => insertPurchase.run(purchase.id, purchase.name, purchase.email, purchase.city, purchase.dateOfBirth, purchase.plan, purchase.createdAt));
			Object.entries(legacyData.subscriptions || {}).forEach(([email, plan]) => insertSubscription.run(email, plan));
			Object.entries(legacyData.usage || {}).forEach(([email, used]) => insertUsage.run(email, used));
			legacyData.conversations.forEach((conversation) => insertConversation.run(conversation.id, conversation.email, conversation.model, conversation.title, JSON.stringify(conversation.messages || []), conversation.createdAt, conversation.updatedAt));
		})();
	}
	connection = {
		filePath,
		database,
		read() {
			return {
				users: database.prepare('SELECT id, name, email, password_hash AS passwordHash FROM users ORDER BY id').all(),
				purchases: database.prepare('SELECT id, name, email, city, date_of_birth AS dateOfBirth, plan, created_at AS createdAt FROM purchases ORDER BY id').all(),
				subscriptions: Object.fromEntries(database.prepare('SELECT email, plan FROM subscriptions').all().map((row) => [row.email, row.plan])),
				usage: Object.fromEntries(database.prepare('SELECT email, used FROM usage').all().map((row) => [row.email, row.used])),
				conversations: database.prepare('SELECT id, email, model, title, messages, created_at AS createdAt, updated_at AS updatedAt FROM conversations ORDER BY updated_at DESC').all().map((item) => ({ ...item, messages: JSON.parse(item.messages) })),
			};
		},
		write(data) {
			database.transaction(() => {
				database.exec('DELETE FROM users; DELETE FROM purchases; DELETE FROM subscriptions; DELETE FROM usage; DELETE FROM conversations;');
				const insertUser = database.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)');
				const insertPurchase = database.prepare('INSERT INTO purchases (id, name, email, city, date_of_birth, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
				const insertSubscription = database.prepare('INSERT INTO subscriptions (email, plan) VALUES (?, ?)');
				const insertUsage = database.prepare('INSERT INTO usage (email, used) VALUES (?, ?)');
				const insertConversation = database.prepare('INSERT INTO conversations (id, email, model, title, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
				(data.users || []).forEach((user) => insertUser.run(user.id, user.name, user.email, user.passwordHash || null));
				(data.purchases || []).forEach((purchase) => insertPurchase.run(purchase.id, purchase.name, purchase.email, purchase.city, purchase.dateOfBirth, purchase.plan, purchase.createdAt));
				Object.entries(data.subscriptions || {}).forEach(([email, plan]) => insertSubscription.run(email, plan));
				Object.entries(data.usage || {}).forEach(([email, used]) => insertUsage.run(email, used));
				(data.conversations || []).forEach((item) => insertConversation.run(item.id, item.email, item.model, item.title, JSON.stringify(item.messages || []), item.createdAt, item.updatedAt));
			})();
			return data;
		},
		close() { database.close(); connection = undefined; },
	};
	return connection;
};

module.exports = { connectDatabase };
