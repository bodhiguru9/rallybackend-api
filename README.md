# Rally Node.js Backend

A well-structured Node.js backend application.

## Project Structure

```
rally-node/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Custom middleware
│   ├── models/          # Data models
│   ├── routes/          # Route definitions
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   ├── validators/      # Validation schemas
│   └── index.js         # Application entry point
├── tests/               # Test files
├── public/              # Static files
├── uploads/             # File uploads
├── .env.example         # Environment variables example
├── .gitignore           # Git ignore file
├── package.json         # Project dependencies
└── README.md            # Project documentation
```

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration

4. Run the application:
```bash
npm run dev
```

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Folder Descriptions

- **config/**: Database connections, app configuration
- **controllers/**: Handle HTTP requests and responses
- **middleware/**: Custom middleware (auth, error handling, etc.)
- **models/**: Data models and schemas
- **routes/**: API route definitions
- **services/**: Business logic layer
- **utils/**: Helper functions and utilities
- **validators/**: Request validation schemas
- **tests/**: Unit and integration tests
- **public/**: Static assets
- **uploads/**: User uploaded files

