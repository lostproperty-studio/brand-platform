import { createRoot } from 'react-dom/client';
import { App } from './app';

const root = createRoot(document.getElementById('root') as Element);
document.documentElement.style.height = document.body.style.height = '100%';
root.render(<App />);
