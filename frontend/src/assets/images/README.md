# Images Directory

This directory contains image asset exports for the GwehAI application.

## Logo

The app logo is served from CDN: `https://cdn.gweh.sh/logo.png`. It is exported from `index.ts` so all pages use the same URL.

## Usage

Import the logo in your components:

```typescript
import { logo } from '../assets/images'

// Then use it in JSX:
<img src={logo} alt="GwehAI Logo" />
```

## Adding New Images

1. Place image files in this directory (or use external URLs in `index.ts`)
2. Export from `index.ts` for centralized use
3. Update this README if adding new image categories
