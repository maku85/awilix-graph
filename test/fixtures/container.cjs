// Explicit CJS container — loaded via require()
const { createContainer, asValue } = require('awilix');
const container = createContainer();
container.register({ mode: asValue('cjs') });
module.exports = container;
