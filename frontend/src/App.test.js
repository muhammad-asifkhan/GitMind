import { render, screen } from '@testing-library/react';
import App from './App';

// Smoke test only — verifies the app renders without crashing and the brand
// is visible. The full feature surface is exercised via the live demo, not
// jsdom: WebSockets and Mermaid both need a real browser.
test('renders the GitMind brand', () => {
  render(<App />);
  expect(screen.getByText(/GitMind/i)).toBeInTheDocument();
});
