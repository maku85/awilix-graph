// ESM container — named { container } export
import { createContainer, asValue } from 'awilix';
const container = createContainer();
container.register({ mode: asValue('esm-named') });
export { container };
