# SQL-база AllModelAI

Проект использует SQLite: `backend/storage/database.sqlite`.
Клиент отправляет запросы `/api/*` серверу Express; сервер читает и записывает SQL.
Пользователи, сессии, чаты, подписки, команды и рабочие данные сохраняются в базе.

## Запуск

Из папки `allModelAi`:

```powershell
cd backend
npm.cmd install
npm.cmd run db:init
npm.cmd run db:check
npm.cmd start
```

В другом терминале из `allModelAi`:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Откройте http://localhost:5173. Проверка соединения: http://localhost:5050/api/health.
Регистрация и сохранение чатов в интерфейсе используют эту базу через API.

## Оплата в режиме разработки

Оплата подключена через Stripe Hosted Checkout. Номер карты и CVC не проходят через frontend или SQLite: их обрабатывает Stripe. Для локальной проверки используйте только тестовые ключи Stripe:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
DEVELOPER_EMAILS=your-email@example.com
```

В Stripe test mode можно использовать карту `4242 4242 4242 4242`, любую будущую дату и любой тестовый CVC. Это не списывает деньги. После успешного Checkout сервер проверяет Stripe session и сохраняет покупку в `purchases`, а активную подписку в `subscription_details`.

Для разработчика с email из `DEVELOPER_EMAILS` кнопка Developer активирует бесплатный доступ без Stripe. Пароли, номера карт и CVC никогда не сохраняются в базе и не должны отправляться в API оплаты.

## Настройка

- `backend/.env`: `DB_FILE=storage/database.sqlite`. Относительный путь всегда считается от `backend`, независимо от директории запуска.
- `frontend/.env`: `API_PROXY_TARGET=http://127.0.0.1:5050`. Работает с Vite dev и preview; перезапустите Vite после изменения.
- В Docker клиент использует существующий Nginx-прокси, база хранится в томе `allmodelai-data`.
- Схема таблиц: `backend/sql/schema.sql`. Создаётся автоматически; совместимые обновления существующих таблиц выполняются в `backend/src/db.js`.
- SQLite работает в режиме WAL с ожиданием блокировки до пяти секунд. Для ручного копирования файла базы сначала остановите сервер.

Существующие данные сохраняются. `db:init` создаёт схему, тестовые аккаунты добавляет существующая логика запуска приложения.
`db:check` открывает базу через тот же инициализатор и проверяет целостность и внешние ключи.
PostgreSQL не подключён: одна переменная `DATABASE_URL` не переключает текущий SQLite-адаптер.
Файл SQLite в `/tmp` на Vercel временный; для постоянного хранения используйте сервер с постоянным диском или Docker-томом.
