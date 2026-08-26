# AllModelAI

Единое рабочее пространство для нескольких AI-моделей: защищённый чат, объяснимый Smart Router, база знаний, AI Arena и командные пространства.

## Запуск

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm start
```

Во втором терминале:

```powershell
cd frontend
npm install
npm run dev
```

Frontend откроется на `http://localhost:5173`, backend — на `http://localhost:5050`.

## Новые возможности

- Все личные API используют серверную HTTP-only сессию; переданный клиентом email не определяет владельца данных.
- Smart Router определяет тип задачи и возвращает выбранную модель вместе с объяснением.
- Документы из Studio индексируются локально и автоматически добавляются в AI-контекст с метками `[KB1]`, `[KB2]`.
- Team Workspace поддерживает роли `owner`, `editor`, `viewer`.
- Сохранённый чат можно опубликовать по случайной read-only ссылке.

## Проверка

```powershell
cd backend
npm test

cd ../frontend
npm run lint
npm run build
```

Секреты хранятся только в `backend/.env`. Демонстрационный выбор социальных аккаунтов отключён по умолчанию и не должен включаться в production.
