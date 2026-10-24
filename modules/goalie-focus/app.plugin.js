// JS entry point for the Goalie focus config plugin.
//
// The plugin itself is authored in TypeScript (plugin/withGoalieFocus.ts) so it
// is type-checked with the rest of the project. Expo resolves config plugins
// with plain Node resolution (resolve-from), which does not understand `.ts`,
// and it does not install a global TS require hook — it only sucrase-transforms
// app.config.ts itself. So this thin `.js` shim registers a sucrase TypeScript
// require hook and then re-exports the real TS plugin.

require('sucrase/dist/register.js').registerTS();

module.exports = require('./plugin/withGoalieFocus').default;
