const path = require('node:path');

function normalizeImportEmail(email) {
    let value = String(email || '').trim();
    if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
    ) {
        value = value.slice(1, -1).trim();
    }
    return value.toLowerCase();
}

function parseEmailArg(value) {
    return normalizeImportEmail(value);
}

function parseArgs(argv, defaultSqlitePath) {
    const args = {
        dryRun: true,
        sqlitePath: process.env.SQLITE_IMPORT_PATH
            ? path.resolve(process.env.SQLITE_IMPORT_PATH)
            : defaultSqlitePath,
        profile: 'production-worthy',
        email: null,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--apply') {
            args.dryRun = false;
        } else if (arg === '--dry-run') {
            args.dryRun = true;
        } else if (arg.startsWith('--sqlite=')) {
            args.sqlitePath = path.resolve(arg.slice('--sqlite='.length));
        } else if (arg.startsWith('--profile=')) {
            args.profile = arg.slice('--profile='.length);
        } else if (arg.startsWith('--email=')) {
            args.email = parseEmailArg(arg.slice('--email='.length));
        } else if (arg === '--email') {
            const next = argv[index + 1];
            if (!next || next.startsWith('--')) {
                throw new Error('Missing value for --email. Use --email="user@example.com".');
            }
            args.email = parseEmailArg(next);
            index += 1;
        }
    }
    return args;
}

function classifyUser(email) {
    const normalized = normalizeImportEmail(email);
    if (!normalized.includes('@')) {
        return 'invalid';
    }
    if (normalized.endsWith('@example.com')) {
        return 'test_example_domain';
    }
    if (normalized.endsWith('@test.com')) {
        return 'test_domain';
    }
    const local = normalized.split('@')[0];
    if (/^wfpdbg/i.test(local)) {
        return 'test_wayforpay_debug';
    }
    if (/^live\d+@ex\.com$/.test(normalized)) {
        return 'test_live_checkout';
    }
    return 'production_worthy';
}

function shouldImportUser(row, profile) {
    const bucket = classifyUser(row.email);
    if (profile === 'all-non-example') {
        return bucket !== 'test_example_domain' && bucket !== 'invalid';
    }
    return bucket === 'production_worthy';
}

function resolveSelectedUsers(allUsers, { profile, email }) {
    if (email) {
        const target = normalizeImportEmail(email);
        if (!target.includes('@')) {
            return { status: 'invalid_email', selected: [], target };
        }
        const matches = allUsers.filter(
            (user) => normalizeImportEmail(user.email) === target,
        );
        if (matches.length === 0) {
            return { status: 'not_found', selected: [], target };
        }
        if (matches.length > 1) {
            return {
                status: 'ambiguous',
                selected: matches,
                target,
                duplicateIds: matches.map((user) => user.id),
            };
        }
        return { status: 'ok', selected: [matches[0]], target };
    }

    const selected = allUsers.filter((user) => shouldImportUser(user, profile));
    return { status: 'ok', selected, target: null };
}

function buildEmailDryRunReport({
    args,
    selection,
    authSessions,
    subscriptions,
    subscriptionDetailsCount = 0,
}) {
    const user = selection.selected[0];
    return {
        mode: args.dryRun ? 'dry-run' : 'apply',
        filter: 'email',
        status: selection.status,
        selectedEmail: user?.email || selection.target,
        selectedUserId: user?.id ?? null,
        passwordHashPresent: Boolean(user?.password_hash),
        authSessionsCount: authSessions.length,
        subscriptionsCount: subscriptions.length,
        subscriptionDetailsCount,
        note: 'Password hashes are never printed. Source SQLite is read-only.',
    };
}

module.exports = {
    normalizeImportEmail,
    parseEmailArg,
    parseArgs,
    classifyUser,
    shouldImportUser,
    resolveSelectedUsers,
    buildEmailDryRunReport,
};
