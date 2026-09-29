function createConnectionApi(database, meta = {}) {
    return {
        engine: meta.engine || 'sqlite',
        filePath: meta.filePath || null,

        read() {
            return {
                users: database
                    .prepare(`
                        SELECT
                            id,
                            name,
                            email,
                            password_hash AS passwordHash
                        FROM users
                        ORDER BY id
                    `)
                    .all(),

                purchases: database
                    .prepare(`
                        SELECT
                            id,
                            name,
                            email,
                            city,
                            date_of_birth AS dateOfBirth,
                            plan,
                            created_at AS createdAt
                        FROM purchases
                        ORDER BY id
                    `)
                    .all(),

                subscriptions:
                    Object.fromEntries(
                        database
                            .prepare(`
                                SELECT
                                    email,
                                    plan
                                FROM subscriptions
                            `)
                            .all()
                            .map(
                                (row) => [
                                    row.email,
                                    row.plan,
                                ],
                            ),
                    ),

                usage:
                    Object.fromEntries(
                        database
                            .prepare(`
                                SELECT
                                    email,
                                    used
                                FROM usage
                            `)
                            .all()
                            .map(
                                (row) => [
                                    row.email,
                                    row.used,
                                ],
                            ),
                    ),

                conversations:
                    database
                        .prepare(`
                            SELECT
                                id,
                                email,
                                model,
                                title,
                                messages,
                                created_at AS createdAt,
                                updated_at AS updatedAt
                            FROM conversations
                            ORDER BY updated_at DESC
                        `)
                        .all()
                        .map(
                            (item) => ({
                                ...item,
                                messages:
                                    JSON.parse(
                                        item.messages,
                                    ),
                            }),
                        ),
            };
        },

        write(data) {
            database.transaction(() => {
                const conversationIds = (
                    data.conversations || []
                )
                    .map(
                        (item) =>
                            item.id,
                    )
                    .filter(Boolean);

                if (conversationIds.length) {
                    database
                        .prepare(`
                            DELETE FROM conversations
                            WHERE id NOT IN (
                                ${conversationIds
                                .map(
                                    () => '?',
                                )
                                .join(',')}
                            )
                        `)
                        .run(
                            ...conversationIds,
                        );
                } else {
                    database.exec(
                        'DELETE FROM conversations',
                    );
                }

                database.exec(`
                    DELETE FROM purchases;
                    DELETE FROM subscriptions;
                    DELETE FROM usage;
                `);

                const insertUser =
                    database.prepare(`
                        INSERT INTO users (
                            id,
                            name,
                            email,
                            password_hash
                        )
                        VALUES (?, ?, ?, ?)

                        ON CONFLICT(id)
                        DO UPDATE SET
                            name =
                                excluded.name,
                            email =
                                excluded.email,
                            password_hash =
                                excluded.password_hash
                    `);

                const insertPurchase =
                    database.prepare(`
                        INSERT INTO purchases (
                            id,
                            name,
                            email,
                            city,
                            date_of_birth,
                            plan,
                            created_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `);

                const insertSubscription =
                    database.prepare(`
                        INSERT INTO subscriptions (
                            email,
                            plan
                        )
                        VALUES (?, ?)
                    `);

                const insertUsage =
                    database.prepare(`
                        INSERT INTO usage (
                            email,
                            used
                        )
                        VALUES (?, ?)
                    `);

                const insertConversation =
                    database.prepare(`
                        INSERT INTO conversations (
                            id,
                            email,
                            model,
                            title,
                            messages,
                            created_at,
                            updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?)

                        ON CONFLICT(id)
                        DO UPDATE SET
                            email =
                                excluded.email,
                            model =
                                excluded.model,
                            title =
                                excluded.title,
                            messages =
                                excluded.messages,
                            updated_at =
                                excluded.updated_at
                    `);

                (
                    data.users || []
                ).forEach(
                    (user) => {
                        insertUser.run(
                            user.id,
                            user.name,
                            user.email,
                            user.passwordHash || null,
                        );
                    },
                );

                (
                    data.purchases || []
                ).forEach(
                    (purchase) => {
                        insertPurchase.run(
                            purchase.id,
                            purchase.name,
                            purchase.email,
                            purchase.city,
                            purchase.dateOfBirth,
                            purchase.plan,
                            purchase.createdAt,
                        );
                    },
                );

                Object.entries(
                    data.subscriptions || {},
                ).forEach(
                    ([email, plan]) => {
                        insertSubscription.run(
                            email,
                            plan,
                        );
                    },
                );

                Object.entries(
                    data.usage || {},
                ).forEach(
                    ([email, used]) => {
                        insertUsage.run(
                            email,
                            used,
                        );
                    },
                );

                (
                    data.conversations || []
                ).forEach(
                    (item) => {
                        insertConversation.run(
                            item.id,
                            item.email,
                            item.model,
                            item.title,
                            JSON.stringify(
                                item.messages || [],
                            ),
                            item.createdAt,
                            item.updatedAt,
                        );
                    },
                );
            })();

            return data;
        },

        close() {
            database.close();
        },

        database,
    };
}

module.exports = {
    createConnectionApi,
};
