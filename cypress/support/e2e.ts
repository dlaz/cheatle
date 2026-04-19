// Cypress E2E support file
import './commands';

// Disable uncaught exception handling in tests
Cypress.on('uncaught:exception', (err) => {
  // Return false to prevent Cypress from failing the test
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false;
  }
  return true;
});
