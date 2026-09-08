const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: 'Name, email and password are required',
            });
        }

        if (typeof password !== 'string') {
            return res.status(400).json({
                message: 'Password must be text',
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message: 'Password must contain at least 6 characters',
            });
        }

        const normalizedEmail = String(email)
            .trim()
            .toLowerCase();

        const normalizedName = String(name).trim();

        if (!normalizedName) {
            return res.status(400).json({
                message: 'Name is required',
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({
                message: 'Enter a valid email address',
            });
        }

      
        const data = req.app.locals.db.read();

        data.users ||= [];

        let existingUser = data.users.find(
            (user) =>
                String(user.email || '')
                    .trim()
                    .toLowerCase() === normalizedEmail
        );

      
        if (existingUser?.passwordHash) {
            return res.status(409).json({
                message: 'An account with this email already exists',
            });
        }

        
        if (existingUser) {
            existingUser.name = normalizedName;

            existingUser.passwordHash =
                await hashPassword(password);

            req.app.locals.db.write(data);

          
            const cacheUser = users.find(
                (user) =>
                    String(user.email || '')
                        .trim()
                        .toLowerCase() === normalizedEmail
            );

            if (cacheUser) {
                cacheUser.name = existingUser.name;
                cacheUser.passwordHash =
                    existingUser.passwordHash;
            } else {
                users.push({ ...existingUser });
            }

            setSession(
                req,
                res,
                existingUser,
                req.body.rememberMe === true ||
                    req.body.rememberMe === 'true'
            );

            return res.status(200).json({
                message:
                    'Password added to your existing account',
                user: publicUser(existingUser),
                welcomeEmail: {
                    sent: false,
                    reason: 'existing_account',
                },
            });
        }

       
        const ids = data.users
            .map((user) => Number(user.id))
            .filter(Number.isFinite);

        const newUser = {
            id: ids.length
                ? Math.max(...ids) + 1
                : 1,

            name: normalizedName,

            email: normalizedEmail,

            passwordHash:
                await hashPassword(password),
        };

        
        data.users.push(newUser);

        req.app.locals.db.write(data);

        
        users.push({ ...newUser });

        setSession(
            req,
            res,
            newUser,
            req.body.rememberMe === true ||
                req.body.rememberMe === 'true'
        );

        let welcomeEmail = {
            sent: false,
            reason: 'not_configured',
        };

        try {
            welcomeEmail =
                await sendWelcomeEmail(newUser);
        } catch (error) {
            console.error(
                '[WELCOME EMAIL]',
                error.message
            );

            welcomeEmail = {
                sent: false,
                reason: 'delivery_failed',
            };
        }

        return res.status(201).json({
            message:
                'Account created successfully',

            user:
                publicUser(newUser),

            welcomeEmail,
        });
    } catch (error) {
        console.error(
            '[REGISTER ERROR]',
            error
        );

        return res.status(500).json({
            message:
                'Could not create account',
        });
    }
};


const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message:
                    'Email and password are required',
            });
        }

        const normalizedEmail =
            String(email)
                .trim()
                .toLowerCase();


        const data =
            req.app.locals.db.read();

        data.users ||= [];

        let user =
            data.users.find(
                (item) =>
                    String(item.email || '')
                        .trim()
                        .toLowerCase() ===
                    normalizedEmail
            );

 

        if (!user) {
            const seedUser =
                users.find(
                    (item) =>
                        String(item.email || '')
                            .trim()
                            .toLowerCase() ===
                        normalizedEmail
                );

            if (seedUser) {
                user = {
                    ...seedUser,
                };

                data.users.push(user);

                req.app.locals.db.write(
                    data
                );
            }
        }

    
        if (!user) {
            return res.status(401).json({
                message:
                    'Incorrect email or password',
            });
        }



        if (!user.passwordHash) {
            user.passwordHash =
                await hashPassword(password);

            req.app.locals.db.write(
                data
            );

       
            const cachedUser =
                users.find(
                    (item) =>
                        String(item.email || '')
                            .trim()
                            .toLowerCase() ===
                        normalizedEmail
                );

            if (cachedUser) {
                cachedUser.passwordHash =
                    user.passwordHash;
            } else {
                users.push({
                    ...user,
                });
            }

            setSession(
                req,
                res,
                user,
                req.body.rememberMe === true ||
                    req.body.rememberMe === 'true'
            );

            return res.status(200).json({
                message:
                    'Password created and signed in successfully',

                passwordCreated: true,

                user:
                    publicUser(user),
            });
        }

        // Проверяем пароль
        const passwordIsCorrect =
            await verifyPassword(
                password,
                user.passwordHash
            );

        if (!passwordIsCorrect) {
            return res.status(401).json({
                message:
                    'Incorrect email or password',
            });
        }

        // Пароль правильный — создаём сессию
        setSession(
            req,
            res,
            user,
            req.body.rememberMe === true ||
                req.body.rememberMe === 'true'
        );

        return res.status(200).json({
            message:
                'Signed in successfully',

            user:
                publicUser(user),
        });
    } catch (error) {
        console.error(
            '[LOGIN ERROR]',
            error
        );

        return res.status(500).json({
            message:
                'Could not sign in',
        });
    }
};