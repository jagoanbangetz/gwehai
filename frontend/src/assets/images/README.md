# Images Directory

This directory contains all image assets for the GwehAI application.

## Structure

- `logo.png` - Main GwehAI logo

## Usage

Import images in your components like this:

```typescript
import logo from '../assets/images/logo.png'

// Then use it in JSX:
<img src={logo} alt="GwehAI Logo" />
```

Or use it directly in CSS:

```css
background-image: url('../assets/images/logo.png');
```

## Adding New Images

1. Place image files in this directory
2. Use descriptive filenames (e.g., `logo.png`, `icon-hero.svg`)
3. Update this README if adding new image categories
