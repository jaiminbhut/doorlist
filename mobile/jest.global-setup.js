// Dates in tests are formatted in UTC, wherever the tests run.
module.exports = () => {
  process.env.TZ = 'UTC';
};
