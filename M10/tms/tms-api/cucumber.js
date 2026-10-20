module.exports = {
  default: {
    formatOptions: {
      snippetInterface: 'async-await',
    },
    paths: ['src/**/*.feature'],
    dryRun: false,
    require: ['src/**/*.steps.ts'],
    requireModule: ['ts-node/register'],
    parallel: 1
  }
}
