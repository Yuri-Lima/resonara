/** Jest config for farm scripts (plain JS under scripts/ + test/farm/). */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/farm/**/*.spec.js'],
  roots: ['<rootDir>/test/farm', '<rootDir>/scripts'],
  moduleFileExtensions: ['js', 'json'],
};
