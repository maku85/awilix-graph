// Explicit ESM container — default export
import { createContainer, asValue } from 'awilix';
const container = createContainer();
container.register({ mode: asValue('esm-default') });
export default container;
