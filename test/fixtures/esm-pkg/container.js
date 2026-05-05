// Plain .js file treated as ESM because of package.json "type": "module"
import { createContainer, asValue } from 'awilix';
const container = createContainer();
container.register({ mode: asValue('js-esm-pkg') });
export default container;
