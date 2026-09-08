-- AllModelAI SQLite schema; existing records are preserved.
CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT
        );

        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY,
            name TEXT,
            email TEXT NOT NULL,
            city TEXT,
            date_of_birth TEXT,
            plan TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            email TEXT PRIMARY KEY,
            plan TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS subscription_details (
            email TEXT PRIMARY KEY,
            plan TEXT NOT NULL,
            billing_interval TEXT NOT NULL,
            request_limit INTEGER NOT NULL,
            period_end TEXT,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS usage (
            email TEXT PRIMARY KEY,
            used INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            model TEXT,
            title TEXT,
            messages TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS auth_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY(user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workspace_items (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS workspace_items_owner_type
        ON workspace_items(
            email,
            type,
            updated_at DESC
        );

        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner_email TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS team_members (
            team_id TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(team_id, email),
            FOREIGN KEY(team_id)
                REFERENCES teams(id)
                ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS shared_conversations (
            token TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            owner_email TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(conversation_id)
                REFERENCES conversations(id)
                ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS team_members_email
        ON team_members(email);

        CREATE TABLE IF NOT EXISTS arena_votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            model_a TEXT NOT NULL,
            model_b TEXT NOT NULL,
            winner TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS developer_api_keys (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            name TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE,
            prefix TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_used_at TEXT,
            expires_at TEXT,
            request_limit INTEGER NOT NULL DEFAULT 1000,
            used_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS developer_api_keys_owner
        ON developer_api_keys(
            email,
            created_at DESC
        );

        CREATE TABLE IF NOT EXISTS background_jobs (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            stage TEXT,
            payload TEXT NOT NULL,
            result TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS background_jobs_owner
        ON background_jobs(
            email,
            created_at DESC
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            kind TEXT NOT NULL,
            read_at TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS notifications_owner
        ON notifications(
            email,
            created_at DESC
        );

        CREATE TABLE IF NOT EXISTS usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            model TEXT,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            fallback_used INTEGER NOT NULL DEFAULT 0,
            estimated_cost REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS usage_events_owner
        ON usage_events(
            email,
            created_at DESC
        );

        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id TEXT,
            metadata TEXT,
            ip TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS audit_events_owner
        ON audit_events(
            email,
            created_at DESC
        );

        CREATE TABLE IF NOT EXISTS webhooks (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            secret_hash TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS webhooks_owner
        ON webhooks(
            email,
            created_at DESC
        );

        CREATE TABLE IF NOT EXISTS account_tokens (
            token_hash TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            purpose TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
