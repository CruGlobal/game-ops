/**
 * Global teardown for Jest
 * Runs once after all test suites have completed
 */
export default async function globalTeardown() {
  // Give async operations time to complete
  await new Promise(resolve => setTimeout(resolve, 200));
}
