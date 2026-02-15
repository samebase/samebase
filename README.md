# Noter

A collaborative code editor connected to GitHub, built as a Turborepo + PNPM monorepo with React + Vite + Convex.

test


## Features

- **Collaborative Editing**: Real-time collaborative code editing
- **GitHub Integration**: Direct connection to GitHub repositories
- **AI-Powered Chat**: Built-in AI assistant for code help and analysis
- **File Management**: Complete file tree navigation and editing
- **Authentication**: Secure user authentication system
- **Real-time Sync**: Live collaboration with other developers

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Convex (real-time database and functions)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Editor**: ProseMark for rich text editing
- **Monorepo**: Turborepo + PNPM
- **Authentication**: Convex Authf
- **GitHub API**: Direct repository integration

## Project Structure

```
├── apps/
│   └── noter/           # Main application
│       ├── src/         # React frontend source
│       ├── convex/      # Convex backend functions
│       └── public/      # Static assets
├── package.json         # Root package configuration
├── turbo.json          # Turborepo configuration
└── pnpm-workspace.yaml # PNPM workspace configuration
```

## Getting Started

### Prerequisites

- Node.js (see `.nvmrc` for version)
- PNPM package manager

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

This will start:
- Vite dev server for the frontend
- Convex development environment
- Hot reloading for both frontend and backend

### Build

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

## Environment Setup

1. Copy environment variables and configure your Convex project
2. Set up GitHub OAuth for repository access
3. Configure authentication providers

## TODO

- **Easy win**: Rename simple/all to important/code

## Contributing

This project uses:
- ESLint and Prettier for code formatting
- Husky for pre-commit hooks
- TypeScript for type safety
- Vitest for testing

## License

[Add your license information here]