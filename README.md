# GwehAI - AI Cybersecurity Pentester

GwehAI is an advanced AI-powered cybersecurity automation platform specializing in penetration testing, exploit recognition, and professional security report generation.

## Features

- **Automated Penetration Testing** - Comprehensive security assessments across multiple attack vectors
- **Exploit Recognition** - AI-powered detection and classification of security vulnerabilities
- **Professional Report Generation** - Detailed pentest reports with executive summaries, technical findings, and remediation recommendations
- **Interactive AI Chat** - Chat with GwehAI to get expert security guidance, vulnerability explanations, and pentesting advice
- **Compliance Mapping** - Automatic mapping to OWASP Top 10, CWE, NIST, PCI-DSS, and other frameworks

## Project Structure

```
scout-ai/
├── frontend/     # React + Vite application
└── backend/      # NestJS TypeScript API
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Backend Setup

```bash
cd backend
npm install
npm run start:dev
```

The backend will run on `http://localhost:3001`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:3000`

## API Endpoints

- `GET /` - API welcome message
- `GET /health` - Health check endpoint
- `POST /chat` - Interactive AI chat endpoint
  ```json
  {
    "message": "What is SQL injection?",
    "conversation": []
  }
  ```

## Features

- Modern React frontend with Vite
- NestJS backend with TypeScript
- Interactive AI chat component
- Responsive design
- CORS enabled for development
- Hot module replacement for fast development

## Development

- Backend: `npm run start:dev` (runs with watch mode)
- Frontend: `npm run dev` (runs with hot reload)

## Build

- Backend: `npm run build`
- Frontend: `npm run build`

## Security Testing Capabilities

GwehAI can help with:
- SQL Injection detection and analysis
- Cross-Site Scripting (XSS) vulnerabilities
- OWASP Top 10 compliance
- Exploit recognition and classification
- Professional pentest report generation
- Security best practices guidance
